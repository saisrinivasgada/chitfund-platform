package com.chitfund.userservice.service;

import com.chitfund.common.context.TenantContext;
import com.chitfund.common.exception.BusinessException;
import com.chitfund.common.exception.ErrorCode;
import com.chitfund.userservice.domain.entity.*;
import com.chitfund.userservice.domain.enums.*;
import com.chitfund.userservice.dto.request.SetupAccountRequest;
import com.chitfund.userservice.dto.response.ChitfundRequestResponse;
import com.chitfund.userservice.dto.response.ChitfundRequestPublicResponse;
import com.chitfund.userservice.repository.*;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.context.ApplicationEventPublisher;

import java.time.LocalDateTime;
import java.util.*;

@Service
@RequiredArgsConstructor
public class ChitfundRequestService {
    private static final List<ChitfundRequestStatus> OPEN = List.of(
            ChitfundRequestStatus.PENDING_MEMBER,
            ChitfundRequestStatus.MEMBER_VERIFIED,
            ChitfundRequestStatus.AWAITING_ADMIN);
    private static final String SETUP_OTP = "APP_ACCESS_SETUP";
    private static final String ACCEPT_OTP = "CHITFUND_ACCEPT";
    private static final String SETUP_EMAIL_OTP = "ACCOUNT_EMAIL_VERIFY";
    private static final String REQUEST_RECOVERY_EMAIL_OTP = "CHITFUND_REQUEST_RECOVERY";

    private final ChitfundAccessRequestRepository requestRepository;
    private final UserRepository userRepository;
    private final MemberUserLinkRepository memberLinkRepository;
    private final TenantRepository tenantRepository;
    private final AccountSetupTokenRepository setupTokenRepository;
    private final AccountEmailOtpService accountEmailOtpService;
    private final PasswordEncoder passwordEncoder;
    private final PasswordValidator passwordValidator;
    private final OtpService otpService;
    private final AuthService authService;
    private final TenantService tenantService;
    private final ChitfundRequestStateService requestStateService;
    private final ChitfundRequestAuditRepository requestAuditRepository;
    private final ApplicationEventPublisher eventPublisher;

    @Transactional
    public ChitfundRequestResponse create(UUID tenantId, UUID memberId, String phone,
                                           String countryCode, String email, UUID requestedBy) {
        expireForMember(tenantId, memberId);
        String normalizedPhone = normalizePhone(phone);
        String normalizedEmail = normalizeEmail(email);
        if (normalizedEmail == null) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                    "Email is required before sending ChitWise App Access");
        }
        String cc = countryCode == null || countryCode.isBlank() ? "+91" : countryCode.trim();
        Optional<ChitfundAccessRequest> open = requestRepository
                .findFirstByTenantIdAndMemberIdAndStatusInOrderByCreatedAtDesc(tenantId, memberId, OPEN);
        if (open.isPresent()) {
            ChitfundAccessRequest current = open.get();
            if (!current.getRequestedPhone().equals(normalizedPhone) || !current.getPhoneCountryCode().equals(cc)) {
                throw conflict("An active Chitfund Request already exists for this member with a different phone number");
            }
            return toResponse(current, null);
        }

        List<User> matches = userRepository.findByPhoneAndPhoneCountryCodeAndDeletedAtIsNull(normalizedPhone, cc)
                .stream().filter(u -> u.getRole() == Role.MEMBER).toList();
        if (matches.size() > 1) {
            throw conflict("This phone number is linked to multiple member identities and requires support review");
        }

        User candidate;
        ChitfundRequestKind kind;
        if (matches.isEmpty()) {
            candidate = User.builder()
                    .username(generatePlaceholderUsername(normalizedPhone))
                    .fullName(null)
                    .phone(normalizedPhone)
                    .phoneCountryCode(cc)
                    .passwordHash(passwordEncoder.encode(UUID.randomUUID().toString()))
                    .role(Role.MEMBER)
                    .enabled(true)
                    .hasAppAccess(false)
                    .mustChangePassword(true)
                    .build();
            candidate = userRepository.save(candidate);
            kind = ChitfundRequestKind.NEW_ACCOUNT;
        } else {
            candidate = matches.get(0);
            boolean unfinished = !candidate.isHasAppAccess() && candidate.isMustChangePassword();
            kind = unfinished ? ChitfundRequestKind.NEW_ACCOUNT : ChitfundRequestKind.LINK_EXISTING;
        }

        LocalDateTime now = LocalDateTime.now();
        String actionToken = newActionToken();
        ChitfundAccessRequest request;
        try {
            request = requestRepository.saveAndFlush(ChitfundAccessRequest.builder()
                .tenantId(tenantId)
                .memberId(memberId)
                .requestedPhone(normalizedPhone)
                .phoneCountryCode(cc)
                .requestedEmail(normalizedEmail)
                .candidateUserId(candidate.getId())
                .memberActionTokenHash(AuthService.sha256Value(actionToken))
                .requestKind(kind)
                .status(ChitfundRequestStatus.PENDING_MEMBER)
                .requestedBy(requestedBy)
                .expiresAt(now.plusHours(72))
                .lastSentAt(now)
                .build());
        } catch (DataIntegrityViolationException ex) {
            // The generated-column unique key is the final guard when two
            // admins create a request concurrently after both read no active
            // row. Expose a deterministic conflict instead of a 500.
            throw conflict("An active Chitfund Request already exists for this member");
        }
        audit(request, "REQUEST_CREATED", null, ChitfundRequestStatus.PENDING_MEMBER,
                requestedBy, "ORG_ADMIN", "App-access request created");

        String setupToken = null;
        if (kind == ChitfundRequestKind.NEW_ACCOUNT) {
            setupToken = authService.generateSetupToken(candidate.getId(), request.getId());
            otpService.sendOtp(normalizedPhone, cc, SETUP_OTP, request.getId().toString());
        }
        if (kind == ChitfundRequestKind.LINK_EXISTING) {
            eventPublisher.publishEvent(new IdentityNotificationEvent(
                    IdentityNotificationEvent.Type.CHITFUND_REQUEST_CREATED,
                    candidate.getId(), request.getId(),
                    tenantRepository.findById(tenantId).map(Tenant::getName).orElse("Organization"),
                    List.of(), null, null));
        }
        return toResponse(request, setupToken, actionToken);
    }

    /**
     * Replaces the unresolved request that caused an approved recycled-phone
     * case with a request for the newly created identity. The old request stays
     * in the audit trail as REVOKED; it is never silently rebound to another
     * person.
     */
    @Transactional
    public ChitfundRequestResponse replaceForApprovedPhoneReassignment(
            UUID tenantId, UUID memberId, String phone, String countryCode,
            String email, UUID newUserId, String operationId) {
        Optional<ChitfundAccessRequest> open = requestRepository
                .findFirstByTenantIdAndMemberIdAndStatusInOrderByCreatedAtDesc(
                        tenantId, memberId, OPEN);
        if (open.isPresent()) {
            ChitfundAccessRequest previous = open.get();
            if (previous.getCandidateUserId().equals(newUserId)) {
                return toResponse(previous, null);
            }
            ChitfundRequestStatus from = previous.getStatus();
            previous.setStatus(ChitfundRequestStatus.REVOKED);
            previous.setMemberActionTokenHash(null);
            requestRepository.saveAndFlush(previous);
            audit(previous, "REQUEST_REVOKED", from, ChitfundRequestStatus.REVOKED,
                    null, "SYSTEM",
                    "Superseded by approved phone reassignment " + operationId);
        }
        ChitfundRequestResponse replacement = create(
                tenantId, memberId, phone, countryCode, email, null);
        boolean stillOwnedByNewIdentity = requestRepository.findById(replacement.getId())
                .map(ChitfundAccessRequest::getCandidateUserId)
                .filter(newUserId::equals)
                .isPresent();
        if (!stillOwnedByNewIdentity) {
            throw new BusinessException(ErrorCode.CONCURRENT_MODIFICATION,
                    "The phone identity changed while the approved reassignment was executing");
        }
        return replacement;
    }

    @Transactional
    public List<ChitfundRequestResponse> mine(UUID userId) {
        expireForUser(userId);
        return requestRepository.findAllByCandidateUserIdAndStatusInOrderByCreatedAtDesc(userId, OPEN)
                .stream().map(r -> toResponse(r, null)).toList();
    }

    @Transactional
    public List<ChitfundRequestResponse> forMember(UUID memberId) {
        UUID tenantId = currentTenant();
        expireForMember(tenantId, memberId);
        return requestRepository.findAllByTenantIdAndMemberIdOrderByCreatedAtDesc(tenantId, memberId)
                .stream().map(r -> toResponse(r, null)).toList();
    }

    @Transactional
    public void sendAcceptOtp(UUID requestId, UUID userId) {
        rejectExpired(requestId);
        ChitfundAccessRequest request = ownedOpenRequest(requestId, userId);
        if (request.getRequestKind() != ChitfundRequestKind.LINK_EXISTING) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED, "Use account setup for a new account");
        }
        if (request.getStatus() == ChitfundRequestStatus.AWAITING_ADMIN) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                    "Your request is awaiting administrator approval. You will be notified when you can proceed.");
        }
        otpService.sendOtp(request.getRequestedPhone(), request.getPhoneCountryCode(),
                ACCEPT_OTP, request.getId().toString());
    }

    @Transactional
    public ChitfundRequestResponse accept(UUID requestId, UUID userId, String code) {
        rejectExpired(requestId);
        ChitfundAccessRequest request = ownedOpenRequestForUpdate(requestId, userId);
        if (request.getRequestKind() != ChitfundRequestKind.LINK_EXISTING) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED, "Use account setup for a new account");
        }
        if (request.getStatus() == ChitfundRequestStatus.AWAITING_ADMIN) {
            return toResponse(request, null);
        }
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));
        if (!Objects.equals(normalizePhone(user.getPhone()), request.getRequestedPhone())
                || !Objects.equals(user.getPhoneCountryCode(), request.getPhoneCountryCode())) {
            ChitfundRequestStatus previous = request.getStatus();
            request.setStatus(ChitfundRequestStatus.ESCALATED);
            request.setMemberActionTokenHash(null);
            // Return the persisted terminal state instead of throwing: throwing from
            // this transaction would roll the escalation back and leave the request open.
            requestRepository.save(request);
            audit(request, "REQUEST_ESCALATED", previous, request.getStatus(), userId,
                    "MEMBER", "Verified account phone no longer matches request");
            return toResponse(request, null);
        }
        otpService.verifyOtp(request.getRequestedPhone(), ACCEPT_OTP, request.getId().toString(), code);
        ChitfundRequestStatus previous = request.getStatus();
        request.setMemberVerifiedAt(LocalDateTime.now());
        request.setStatus(ChitfundRequestStatus.AWAITING_ADMIN);
        requestRepository.save(request);
        audit(request, "MEMBER_VERIFIED", previous, request.getStatus(), userId,
                "MEMBER", "Existing account accepted with a fresh phone OTP");
        return toResponse(request, null);
    }

    @Transactional
    public ChitfundRequestResponse decline(UUID requestId, UUID userId) {
        rejectExpired(requestId);
        ChitfundAccessRequest request = ownedOpenRequestForUpdate(requestId, userId);
        ChitfundRequestStatus previous = request.getStatus();
        request.setStatus(ChitfundRequestStatus.DECLINED);
        request.setMemberActionTokenHash(null);
        requestRepository.save(request);
        audit(request, "REQUEST_DECLINED", previous, request.getStatus(), userId,
                "MEMBER", "Member declined organization access");
        return toResponse(request, null);
    }

    @Transactional
    public ChitfundRequestResponse resend(UUID requestId, UUID adminId) {
        rejectExpired(requestId);
        ChitfundAccessRequest request = tenantRequestForUpdate(requestId);
        if (!OPEN.contains(request.getStatus())) {
            throw conflict("Only an open Chitfund Request can be resent");
        }
        LocalDateTime now = LocalDateTime.now();
        long wait = Math.min(300, Math.max(60, request.getResendCount() + 1L) * 60L);
        if (request.getLastSentAt().plusSeconds(wait).isAfter(now)) {
            throw new BusinessException(ErrorCode.OTP_RATE_LIMITED,
                    "Please wait before resending this request", HttpStatus.TOO_MANY_REQUESTS);
        }
        request.setResendCount(request.getResendCount() + 1);
        request.setLastSentAt(now);
        request.setExpiresAt(now.plusHours(72));
        request.setRequestedBy(adminId);
        String setupToken = null;
        String actionToken = newActionToken();
        request.setMemberActionTokenHash(AuthService.sha256Value(actionToken));
        User candidate = userRepository.findById(request.getCandidateUserId())
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));
        if (request.getRequestKind() == ChitfundRequestKind.NEW_ACCOUNT
                && candidate.isHasAppAccess() && !candidate.isMustChangePassword()) {
            request.setRequestKind(ChitfundRequestKind.LINK_EXISTING);
        }
        if (request.getRequestKind() == ChitfundRequestKind.NEW_ACCOUNT) {
            setupToken = authService.generateSetupToken(request.getCandidateUserId(), request.getId());
            otpService.sendOtp(request.getRequestedPhone(), request.getPhoneCountryCode(),
                    SETUP_OTP, request.getId().toString());
        }
        requestRepository.save(request);
        audit(request, "REQUEST_RESENT", request.getStatus(), request.getStatus(), adminId,
                "ORG_ADMIN", "Request expiry and single-use links refreshed");
        if (request.getRequestKind() == ChitfundRequestKind.LINK_EXISTING) {
            eventPublisher.publishEvent(new IdentityNotificationEvent(
                    IdentityNotificationEvent.Type.CHITFUND_REQUEST_CREATED,
                    request.getCandidateUserId(), request.getId(),
                    tenantRepository.findById(request.getTenantId()).map(Tenant::getName).orElse("Organization"),
                    List.of(), null, null));
        }
        return toResponse(request, setupToken, actionToken);
    }

    @Transactional
    public ChitfundRequestResponse revoke(UUID requestId) {
        rejectExpired(requestId);
        ChitfundAccessRequest request = tenantRequestForUpdate(requestId);
        if (!OPEN.contains(request.getStatus())) return toResponse(request, null);
        ChitfundRequestStatus previous = request.getStatus();
        request.setStatus(ChitfundRequestStatus.REVOKED);
        request.setMemberActionTokenHash(null);
        requestRepository.save(request);
        audit(request, "REQUEST_REVOKED", previous, request.getStatus(), null,
                "ORG_ADMIN", "Organization revoked app-access request");
        return toResponse(request, null);
    }

    @Transactional
    public ChitfundRequestResponse confirm(UUID requestId, UUID adminId) {
        rejectExpired(requestId);
        ChitfundAccessRequest request = tenantRequestForUpdate(requestId);
        if (request.getStatus() == ChitfundRequestStatus.ACTIVE) return toResponse(request, null);
        if (request.getStatus() != ChitfundRequestStatus.AWAITING_ADMIN) {
            throw conflict("The member must complete verification before app access can be activated");
        }
        // Establish and flush the local uniqueness guard before asking the
        // member service to expose app access. If the link conflicts, no
        // cross-service state has been changed. A member-service failure rolls
        // this local transaction back; the member endpoint is itself
        // idempotent for safe retries.
        try {
            tenantService.addUserToTenant(request.getCandidateUserId(), request.getTenantId(),
                    Role.MEMBER, request.getMemberId());
        } catch (DataIntegrityViolationException ex) {
            throw conflict("This account is already connected to another member in this organization");
        }
        User user = userRepository.findById(request.getCandidateUserId())
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));
        user.setHasAppAccess(true);
        userRepository.save(user);
        request.setAdminConfirmedAt(LocalDateTime.now());
        request.setAdminConfirmedBy(adminId);
        request.setStatus(ChitfundRequestStatus.ACTIVE);
        request.setMemberActionTokenHash(null);
        requestRepository.save(request);
        audit(request, "ACCESS_ACTIVATED", ChitfundRequestStatus.AWAITING_ADMIN,
                request.getStatus(), adminId, "ORG_ADMIN", "Organization activated member app access");
        // activateAppAccess is called post-commit via IdentityNotificationListener to avoid
        // holding a DB connection during the HTTP call and to prevent state divergence if
        // the DB write succeeds but the TX rolls back. The member-service endpoint is idempotent.
        eventPublisher.publishEvent(new IdentityNotificationEvent(
                IdentityNotificationEvent.Type.CHITFUND_ACCESS_ACTIVATED,
                request.getCandidateUserId(), request.getId(),
                tenantRepository.findById(request.getTenantId()).map(Tenant::getName).orElse("Organization"),
                List.of(), request.getTenantId(), request.getMemberId()));
        return toResponse(request, null);
    }

    @Transactional
    public void sendSetupEmailOtp(String rawToken, String email) {
        AccountSetupToken token = validSetupToken(rawToken);
        User user = userRepository.findById(token.getUserId())
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));
        String normalized = normalizeEmail(email);
        if (normalized == null) throw new BusinessException(ErrorCode.VALIDATION_FAILED, "Enter a valid email");
        userRepository.findByEmail(normalized).filter(u -> !u.getId().equals(user.getId())).ifPresent(u -> {
            throw new BusinessException(ErrorCode.EMAIL_TAKEN);
        });
        accountEmailOtpService.send(user.getId().toString(), normalized, SETUP_EMAIL_OTP, user.getFullName());
    }

    @Transactional
    public ChitfundRequestResponse completeSetup(SetupAccountRequest input) {
        AccountSetupToken token = validSetupToken(input.getToken());
        User user = userRepository.findById(token.getUserId())
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));
        if (token.getChitfundRequestId() == null) {
            throw new BusinessException(ErrorCode.TOKEN_INVALID,
                    "This setup link is not bound to a Chitfund Request. Ask the organization to resend it.");
        }
        rejectExpired(token.getChitfundRequestId());
        ChitfundAccessRequest request = requestRepository.findByIdForUpdate(token.getChitfundRequestId())
                .orElseThrow(() -> new BusinessException(ErrorCode.TOKEN_INVALID,
                        "The Chitfund Request for this setup link no longer exists"));
        if (!request.getCandidateUserId().equals(user.getId())
                || request.getRequestKind() != ChitfundRequestKind.NEW_ACCOUNT
                || !OPEN.contains(request.getStatus())) {
            throw new BusinessException(ErrorCode.TOKEN_INVALID,
                    "This setup link is no longer valid for the request");
        }
        if (input.getPhoneOtp() == null) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED, "Phone OTP is required");
        }
        otpService.verifyOtp(request.getRequestedPhone(), SETUP_OTP, request.getId().toString(), input.getPhoneOtp());
        passwordValidator.validate(input.getNewPassword());
        if (input.getUsername() != null && !input.getUsername().isBlank()
                && !input.getUsername().equalsIgnoreCase(user.getUsername())) {
            String username = input.getUsername().trim().toLowerCase();
            if (userRepository.existsByUsername(username)) throw new BusinessException(ErrorCode.USERNAME_TAKEN);
            user.setUsername(username);
        }
        if (input.getFullName() != null && !input.getFullName().isBlank()) {
            user.setFullName(input.getFullName().trim());
        }
        String email = normalizeEmail(input.getEmail());
        if (email != null) {
            verifyEmailOtp(user, email, input.getEmailOtp());
            user.setEmail(email);
            user.setEmailVerifiedAt(LocalDateTime.now());
        }
        user.setPasswordHash(passwordEncoder.encode(input.getNewPassword()));
        user.setTempPasswordHash(null);
        user.setMustChangePassword(false);
        user.setTermsAcceptedAt(LocalDateTime.now());
        user.setTermsVersion("1.0");
        userRepository.save(user);
        token.setUsedAt(LocalDateTime.now());
        setupTokenRepository.save(token);
        request.setMemberVerifiedAt(LocalDateTime.now());
        request.setStatus(ChitfundRequestStatus.AWAITING_ADMIN);
        requestRepository.save(request);
        audit(request, "ACCOUNT_SETUP_VERIFIED", ChitfundRequestStatus.PENDING_MEMBER,
                request.getStatus(), user.getId(), "MEMBER",
                "New account completed phone and recovery-email verification");
        ChitfundRequestResponse response = toResponse(request, null);
        requestRepository.findAllByCandidateUserIdAndStatusInOrderByCreatedAtDesc(user.getId(), OPEN)
                .stream()
                .filter(other -> !other.getId().equals(request.getId()))
                .filter(other -> other.getRequestKind() == ChitfundRequestKind.NEW_ACCOUNT)
                .forEach(other -> {
                    other.setRequestKind(ChitfundRequestKind.LINK_EXISTING);
                    audit(other, "REQUEST_KIND_RECLASSIFIED", other.getStatus(), other.getStatus(),
                            user.getId(), "SYSTEM", "Candidate now has an established ChitWise account");
                });
        return response;
    }

    private void verifyEmailOtp(User user, String email, String code) {
        if (code == null || code.isBlank()) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED, "Email OTP is required");
        }
        accountEmailOtpService.verify(user.getId().toString(), email, SETUP_EMAIL_OTP, code);
    }

    @Transactional
    public ChitfundRequestPublicResponse publicDetails(String rawToken) {
        ChitfundAccessRequest request = requestByActionToken(rawToken);
        rejectExpired(request.getId());
        if (!OPEN.contains(request.getStatus())) {
            throw new BusinessException(ErrorCode.TOKEN_INVALID,
                    "Chitfund Request link is no longer active");
        }
        User user = userRepository.findById(request.getCandidateUserId())
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));
        return ChitfundRequestPublicResponse.builder()
                .organizationName(tenantRepository.findById(request.getTenantId()).map(Tenant::getName).orElse("Organization"))
                .maskedPhone(maskPhone(request.getRequestedPhone()))
                .maskedEmail(maskEmail(user.getEmail()))
                .requestKind(request.getRequestKind())
                .status(request.getStatus())
                .expiresAt(request.getExpiresAt())
                .emailRecoveryAvailable(request.getRequestKind() == ChitfundRequestKind.LINK_EXISTING
                        && user.getEmail() != null && user.getEmailVerifiedAt() != null)
                .build();
    }

    @Transactional
    public void sendRequestRecoveryEmailOtp(String rawToken) {
        ChitfundAccessRequest request = requestByActionToken(rawToken);
        ensureExistingRequestRecoveryAllowed(request);
        User user = verifiedEmailUser(request);
        accountEmailOtpService.send(request.getId().toString(), user.getEmail(),
                REQUEST_RECOVERY_EMAIL_OTP, user.getFullName());
    }

    @Transactional
    public String verifyRequestRecoveryEmailOtp(String rawToken, String code) {
        ChitfundAccessRequest request = requestByActionToken(rawToken);
        ensureExistingRequestRecoveryAllowed(request);
        User user = verifiedEmailUser(request);
        accountEmailOtpService.verify(request.getId().toString(), user.getEmail(),
                REQUEST_RECOVERY_EMAIL_OTP, code);
        String resetToken = UUID.randomUUID().toString().replace("-", "")
                + UUID.randomUUID().toString().replace("-", "");
        user.setPasswordResetToken(AuthService.sha256Value(resetToken));
        user.setPasswordResetTokenExpiresAt(LocalDateTime.now().plusMinutes(15));
        userRepository.save(user);
        return resetToken;
    }

    private ChitfundAccessRequest requestByActionToken(String rawToken) {
        if (rawToken == null || rawToken.isBlank()) throw new BusinessException(ErrorCode.TOKEN_INVALID);
        return requestRepository.findByMemberActionTokenHash(AuthService.sha256Value(rawToken))
                .orElseThrow(() -> new BusinessException(ErrorCode.TOKEN_INVALID,
                        "Chitfund Request link is invalid or expired"));
    }

    private void ensureExistingRequestRecoveryAllowed(ChitfundAccessRequest request) {
        rejectExpired(request.getId());
        if (request.getRequestKind() != ChitfundRequestKind.LINK_EXISTING || !OPEN.contains(request.getStatus())) {
            throw new BusinessException(ErrorCode.FORBIDDEN,
                    "Email recovery is available only while accepting an existing-account request");
        }
    }

    private User verifiedEmailUser(ChitfundAccessRequest request) {
        User user = userRepository.findById(request.getCandidateUserId())
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));
        if (user.getEmail() == null || user.getEmailVerifiedAt() == null) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                    "No verified recovery email is available. Use normal mobile recovery or ask the organization to create an Account Access ticket.");
        }
        return user;
    }

    private AccountSetupToken validSetupToken(String rawToken) {
        String hash = AuthService.sha256Value(rawToken);
        AccountSetupToken token = setupTokenRepository.findByTokenHash(hash)
                .orElseThrow(() -> new BusinessException(ErrorCode.TOKEN_INVALID, "Setup link is invalid or expired"));
        if (token.isUsed() || token.isExpired()) throw new BusinessException(ErrorCode.TOKEN_INVALID,
                token.isUsed() ? "Setup link has already been used" : "Setup link has expired");
        return token;
    }

    private ChitfundAccessRequest ownedOpenRequest(UUID id, UUID userId) {
        ChitfundAccessRequest request = requestRepository.findById(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND, "Chitfund Request not found"));
        if (!request.getCandidateUserId().equals(userId) || !OPEN.contains(request.getStatus())) {
            throw new BusinessException(ErrorCode.FORBIDDEN);
        }
        return request;
    }

    private ChitfundAccessRequest ownedOpenRequestForUpdate(UUID id, UUID userId) {
        ChitfundAccessRequest request = requestRepository.findByIdForUpdate(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND, "Chitfund Request not found"));
        if (!request.getCandidateUserId().equals(userId) || !OPEN.contains(request.getStatus())) {
            throw new BusinessException(ErrorCode.FORBIDDEN);
        }
        return request;
    }

    private ChitfundAccessRequest tenantRequestForUpdate(UUID id) {
        ChitfundAccessRequest request = requestRepository.findByIdForUpdate(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND, "Chitfund Request not found"));
        if (!request.getTenantId().equals(currentTenant())) throw new BusinessException(ErrorCode.FORBIDDEN);
        return request;
    }

    private UUID currentTenant() {
        String tenant = TenantContext.get();
        if (tenant == null) throw new BusinessException(ErrorCode.FORBIDDEN, "Organization context is required");
        return UUID.fromString(tenant);
    }

    private void rejectExpired(UUID requestId) {
        // Check in the state service's independent transaction. Loading the row
        // into this transaction before findByIdForUpdate would put an unlocked
        // entity in the persistence context and can turn two concurrent accepts
        // into an optimistic-lock 500 instead of serialized idempotent results.
        if (requestStateService.expireIfDue(requestId, LocalDateTime.now())) {
            throw new BusinessException(ErrorCode.TOKEN_EXPIRED, "Chitfund Request has expired");
        }
    }

    private void expireForMember(UUID tenantId, UUID memberId) {
        LocalDateTime now = LocalDateTime.now();
        requestRepository.findAllByTenantIdAndMemberIdAndStatusInAndExpiresAtBefore(
                        tenantId, memberId, OPEN, now)
                .forEach(request -> requestStateService.expireIfDue(request.getId(), now));
    }

    private void expireForUser(UUID userId) {
        LocalDateTime now = LocalDateTime.now();
        requestRepository.findAllByCandidateUserIdAndStatusInAndExpiresAtBefore(
                        userId, OPEN, now)
                .forEach(request -> requestStateService.expireIfDue(request.getId(), now));
    }

    private void audit(ChitfundAccessRequest request, String action,
                       ChitfundRequestStatus from, ChitfundRequestStatus to,
                       UUID actorId, String actorType, String details) {
        requestAuditRepository.save(ChitfundRequestAudit.builder()
                .requestId(request.getId())
                .action(action)
                .fromStatus(from)
                .toStatus(to)
                .actorId(actorId)
                .actorType(actorType)
                .details(details)
                .build());
    }

    private ChitfundRequestResponse toResponse(ChitfundAccessRequest r, String setupToken) {
        return toResponse(r, setupToken, null);
    }

    private ChitfundRequestResponse toResponse(ChitfundAccessRequest r, String setupToken, String actionToken) {
        User user = userRepository.findById(r.getCandidateUserId()).orElse(null);
        String organization = tenantRepository.findById(r.getTenantId()).map(Tenant::getName).orElse("Organization");
        return ChitfundRequestResponse.builder()
                .id(r.getId()).tenantId(r.getTenantId()).memberId(r.getMemberId())
                .organizationName(organization).maskedPhone(maskPhone(r.getRequestedPhone()))
                .maskedEmail(maskEmail(user != null ? user.getEmail() : null))
                .requestKind(r.getRequestKind()).status(r.getStatus()).expiresAt(r.getExpiresAt())
                .memberVerifiedAt(r.getMemberVerifiedAt()).adminConfirmedAt(r.getAdminConfirmedAt())
                .emailVerified(user != null && user.getEmailVerifiedAt() != null)
                .setupToken(setupToken).actionToken(actionToken).build();
    }

    private static String newActionToken() {
        return UUID.randomUUID().toString().replace("-", "")
                + UUID.randomUUID().toString().replace("-", "");
    }

    private String generatePlaceholderUsername(String phone) {
        String base = "pending_" + phone.replaceAll("\\D", "");
        return base + "_" + UUID.randomUUID().toString().replace("-", "").substring(0, 8);
    }

    private static String normalizePhone(String phone) {
        return phone == null ? "" : phone.replaceAll("\\D", "");
    }

    private static String normalizeEmail(String email) {
        return email == null || email.isBlank() ? null : email.trim().toLowerCase();
    }

    private static String maskPhone(String phone) {
        if (phone == null || phone.length() < 4) return "****";
        return "*".repeat(phone.length() - 4) + phone.substring(phone.length() - 4);
    }

    private static String maskEmail(String email) {
        if (email == null || !email.contains("@")) return null;
        String[] parts = email.split("@", 2);
        return parts[0].substring(0, 1) + "***@" + parts[1];
    }

    private static BusinessException conflict(String message) {
        return new BusinessException(ErrorCode.CONCURRENT_MODIFICATION, message, HttpStatus.CONFLICT);
    }
}
