package com.chitfund.userservice.service;

import com.chitfund.common.exception.BusinessException;
import com.chitfund.common.exception.ErrorCode;
import com.chitfund.userservice.client.AuditClient;
import com.chitfund.userservice.domain.entity.AccountSetupToken;
import com.chitfund.userservice.domain.entity.User;
import com.chitfund.userservice.domain.enums.SetupTokenPurpose;
import com.chitfund.userservice.dto.request.OrgUserSetupCompleteRequest;
import com.chitfund.userservice.dto.request.OrgUserSetupEmailOtpRequest;
import com.chitfund.userservice.dto.response.OrgUserSetupPublicResponse;
import com.chitfund.userservice.repository.AccountSetupTokenRepository;
import com.chitfund.userservice.repository.RefreshTokenRepository;
import com.chitfund.userservice.repository.TenantRepository;
import com.chitfund.userservice.repository.TrustedDeviceRepository;
import com.chitfund.userservice.repository.UserRepository;
import com.chitfund.userservice.exception.IncorrectOtpException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.LocalDateTime;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;

/**
 * Handles the org-user account-setup flow initiated by SUPER_ADMIN.
 * This flow is separate from ChitfundRequestService.completeSetup() and uses
 * ORG_USER_INVITE purpose tokens. The two flows are purpose-bound and cannot
 * accept each other's tokens.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class OrgUserSetupService {

    private static final String SETUP_EMAIL_OTP_PURPOSE = "ORG_USER_SETUP";

    private final AccountSetupTokenRepository setupTokenRepository;
    private final UserRepository userRepository;
    private final TenantRepository tenantRepository;
    private final AccountEmailOtpService accountEmailOtpService;
    private final PasswordEncoder passwordEncoder;
    private final PasswordValidator passwordValidator;
    private final AuditClient auditClient;
    private final RefreshTokenRepository refreshTokenRepository;
    private final TrustedDeviceRepository trustedDeviceRepository;

    /**
     * Returns privacy-safe token details without consuming the token.
     * Safe to call before OTP send — never exposes email in full.
     */
    @Transactional(readOnly = true)
    public OrgUserSetupPublicResponse getPublicDetails(String rawToken) {
        String tokenHash = sha256(rawToken);
        AccountSetupToken token = setupTokenRepository.findByTokenHash(tokenHash)
                .orElseThrow(() -> new BusinessException(ErrorCode.TOKEN_INVALID,
                        "Setup link is invalid or not found"));
        rejectWrongPurpose(token);

        User user = userRepository.findById(token.getUserId())
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));

        String orgName = tenantRepository.findById(
                java.util.UUID.fromString(user.getTenantId()))
                .map(t -> t.getName())
                .orElse("Unknown Organization");

        return OrgUserSetupPublicResponse.builder()
                .username(user.getUsername())
                .maskedEmail(maskEmail(user.getEmail()))
                .orgName(orgName)
                .role(user.getRole().name())
                .expired(token.isExpired())
                .used(token.isUsed())
                .build();
    }

    /**
     * Sends an email OTP to the email address stored on the user account.
     * Does not accept a caller-supplied email to prevent redirection attacks.
     */
    @Transactional
    public void sendEmailOtp(OrgUserSetupEmailOtpRequest request) {
        String tokenHash = sha256(request.getToken());
        AccountSetupToken token = setupTokenRepository.findByTokenHash(tokenHash)
                .orElseThrow(() -> new BusinessException(ErrorCode.TOKEN_INVALID,
                        "Setup link is invalid or not found"));
        rejectWrongPurpose(token);
        rejectConsumed(token);

        User user = userRepository.findById(token.getUserId())
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));
        if (user.getEmail() == null || user.getEmail().isBlank()) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                    "No email address is on file for this account. Contact your administrator.",
                    HttpStatus.BAD_REQUEST);
        }
        accountEmailOtpService.send(
                user.getId().toString(), user.getEmail(),
                SETUP_EMAIL_OTP_PURPOSE, user.getFullName());
    }

    /**
     * Completes account setup atomically:
     * - validates token purpose, hash, unused state, expiry
     * - validates terms acceptance and password policy (cheap, no side effects)
     * - checks OTP via REQUIRES_NEW inner transaction (commits attempt count only)
     * - in the SAME outer transaction: marks OTP consumed, saves password hash,
     *   marks email verified, marks token used, revokes sessions, emits audit
     *
     * If any write after the OTP check fails, the outer transaction rolls back
     * INCLUDING the OTP consumed flag — so the user can retry with the same OTP.
     * Incorrect OTP attempts still commit independently (REQUIRES_NEW).
     */
    @Transactional(noRollbackFor = IncorrectOtpException.class)
    public void complete(OrgUserSetupCompleteRequest request) {
        String tokenHash = sha256(request.getToken());
        // Pessimistic lock prevents two concurrent requests from both succeeding
        AccountSetupToken token = setupTokenRepository.findByTokenHashForUpdate(tokenHash)
                .orElseThrow(() -> new BusinessException(ErrorCode.TOKEN_INVALID,
                        "Setup link is invalid or not found"));
        rejectWrongPurpose(token);
        rejectConsumed(token);

        User user = userRepository.findById(token.getUserId())
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));

        if (user.getEmail() == null || user.getEmail().isBlank()) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                    "No email address is on file. Contact your administrator.", HttpStatus.BAD_REQUEST);
        }

        // Terms and password validation before the OTP check — cheap, no side effects.
        // A weak password or missing terms-acceptance must never burn the user's OTP.
        if (!request.isTermsAccepted()) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                    "You must accept the terms of service to continue", HttpStatus.BAD_REQUEST);
        }

        passwordValidator.validate(request.getNewPassword());

        // Phase 1: validate the OTP and increment the attempt counter.
        // Runs in its own REQUIRES_NEW transaction — the counter is committed even
        // if this method later rolls back. Throws IncorrectOtpException (not
        // BusinessException) on wrong code; noRollbackFor above lets the outer
        // transaction commit its empty state so the counter increment is visible.
        String otpId = accountEmailOtpService.checkAndIncrementAttempt(
                user.getId().toString(), user.getEmail(),
                SETUP_EMAIL_OTP_PURPOSE, request.getEmailOtp());

        // Phase 2: mark OTP consumed in the SAME outer transaction as all writes below.
        // If any of these saves fail, the entire outer transaction rolls back —
        // including the verified=true flag — so the OTP remains usable.
        accountEmailOtpService.markConsumed(otpId);

        user.setPasswordHash(passwordEncoder.encode(request.getNewPassword()));
        user.setTempPasswordHash(null);
        user.setMustChangePassword(false);
        user.setEmailVerifiedAt(LocalDateTime.now());
        user.setEmailVerificationRequired(false);
        user.setTermsAcceptedAt(LocalDateTime.now());
        user.setTermsVersion("1.0");
        userRepository.save(user);

        // Mark token used and revoke all other active ORG_USER_INVITE tokens for this user.
        LocalDateTime now = LocalDateTime.now();
        token.setUsedAt(now);
        setupTokenRepository.save(token);
        setupTokenRepository.findAllByUserIdAndPurposeAndUsedAtIsNull(
                        user.getId(), SetupTokenPurpose.ORG_USER_INVITE)
                .forEach(t -> { t.setUsedAt(now); setupTokenRepository.save(t); });

        refreshTokenRepository.revokeAllActiveByUser(user);
        trustedDeviceRepository.deleteByUserId(user.getId());

        auditClient.log("USER", user.getId().toString(),
                "ORG_USER_SETUP_COMPLETED",
                user.getId().toString(), "SELF",
                Map.of("emailVerified", false, "mustChangePassword", true),
                Map.of("emailVerified", true, "mustChangePassword", false),
                user.getTenantId());
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private static void rejectWrongPurpose(AccountSetupToken token) {
        if (token.getPurpose() != SetupTokenPurpose.ORG_USER_INVITE) {
            throw new BusinessException(ErrorCode.TOKEN_INVALID,
                    "This setup link is not valid for organization-user setup");
        }
    }

    private static void rejectConsumed(AccountSetupToken token) {
        if (token.isUsed()) {
            throw new BusinessException(ErrorCode.TOKEN_INVALID,
                    "This setup link has already been used");
        }
        if (token.isExpired()) {
            throw new BusinessException(ErrorCode.TOKEN_INVALID,
                    "This setup link has expired. Ask your administrator to resend it.");
        }
    }

    static String sha256(String value) {
        try {
            byte[] bytes = MessageDigest.getInstance("SHA-256")
                    .digest((value == null ? "" : value).getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(bytes);
        } catch (java.security.NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 not available", e);
        }
    }

    static String maskEmail(String email) {
        if (email == null || !email.contains("@")) return "***@***";
        int at = email.indexOf('@');
        String local = email.substring(0, at);
        String domain = email.substring(at);
        if (local.length() <= 1) return local + "***" + domain;
        return local.charAt(0) + "***" + domain;
    }
}
