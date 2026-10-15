package com.chitfund.userservice.service;

import lombok.extern.slf4j.Slf4j;
import com.chitfund.common.exception.BusinessException;
import com.chitfund.common.exception.ErrorCode;
import com.chitfund.userservice.client.AuditClient;
import com.chitfund.userservice.event.NotificationEventPublisher;
import com.chitfund.userservice.domain.entity.Tenant;
import com.chitfund.userservice.domain.entity.User;
import com.chitfund.userservice.domain.entity.MemberUserLink;
import com.chitfund.userservice.domain.enums.Role;
import com.chitfund.userservice.dto.request.AddOrgUserRequest;
import com.chitfund.userservice.dto.request.RegisterOrgRequest;
import com.chitfund.userservice.dto.request.UpdateTenantRequest;
import com.chitfund.userservice.dto.response.ActivationResponse;
import com.chitfund.userservice.dto.response.OrgUserResponse;
import com.chitfund.userservice.dto.response.TenantInfo;
import com.chitfund.userservice.dto.response.TenantResponse;
import com.chitfund.userservice.domain.entity.PlanLimits;
import com.chitfund.userservice.domain.entity.TenantCustomLimits;
import com.chitfund.userservice.domain.entity.TenantCreditAdjustment;
import com.chitfund.userservice.dto.request.SetCustomLimitsRequest;
import com.chitfund.userservice.dto.response.EffectiveLimitsResponse;
import com.chitfund.userservice.dto.response.BillingInfoResponse;
import com.chitfund.userservice.repository.PromotionRepository;
import com.chitfund.userservice.repository.TenantCustomLimitsRepository;
import com.chitfund.userservice.repository.TenantRepository;
import com.chitfund.userservice.repository.UserRepository;
import com.chitfund.userservice.repository.MemberUserLinkRepository;
import com.chitfund.userservice.repository.PlanLimitsRepository;
import com.chitfund.userservice.repository.PlanCapabilityDefRepository;
import com.chitfund.userservice.repository.TenantCreditAdjustmentRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import com.chitfund.userservice.util.CapabilityJson;
import com.chitfund.userservice.util.PlanInputValidator;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;

@Service
@RequiredArgsConstructor
@Transactional
@Slf4j
public class TenantService {

    private static final java.time.LocalDateTime FREE_PLAN_EXPIRY =
            java.time.LocalDateTime.of(9999, 12, 31, 23, 59, 59);
    private static final int MANUAL_PAID_PLAN_DAYS = 30;

    private final TenantRepository tenantRepository;
    private final UserRepository userRepository;
    private final MemberUserLinkRepository memberLinkRepository;
    private final TenantCustomLimitsRepository customLimitsRepository;
    private final PlanLimitsRepository planLimitsRepository;
    private final PlanCapabilityDefRepository capabilityDefRepository;
    private final PromotionRepository promotionRepository;
    private final PasswordEncoder passwordEncoder;
    private final PromotionService promotionService;
    private final NotificationEventPublisher notificationEventPublisher;
    private final AuditClient auditClient;
    private final com.fasterxml.jackson.databind.ObjectMapper objectMapper;
    private final TenantCreditAdjustmentRepository creditAdjustmentRepository;

    // ── Public org self-registration ─────────────────────────────────────────

    public TenantResponse registerOrg(RegisterOrgRequest req) {
        if (RESERVED_SLUGS.contains(req.getSlug().toLowerCase())) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                    "Subdomain '" + req.getSlug() + "' is reserved and cannot be used", HttpStatus.CONFLICT);
        }
        if (tenantRepository.existsBySlugAndStatusNot(req.getSlug(), "REJECTED")) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                    "Subdomain '" + req.getSlug() + "' is already taken", HttpStatus.CONFLICT);
        }
        if (userRepository.existsByEmail(req.getAdminEmail())) {
            throw new BusinessException(ErrorCode.EMAIL_TAKEN,
                    "An account with this email already exists");
        }

        String plan = (req.getPlan() != null && !req.getPlan().isBlank()) ? req.getPlan().toUpperCase() : "BASIC";
        planLimitsRepository.findById(plan)
                .filter(candidate -> candidate.isActive() && candidate.isPublic())
                .orElseThrow(() -> new BusinessException(ErrorCode.VALIDATION_FAILED,
                        "Select a public active subscription plan"));

        // Create tenant (status = PENDING until super-admin activates)
        String referralCode = "REF-" + req.getSlug().toUpperCase().replace("-", "");
        Tenant tenant = Tenant.builder()
                .name(req.getOrgName())
                .slug(req.getSlug())
                .status("PENDING")
                .plan(plan)
                .contactPhone(req.getAdminPhone())
                .contactEmail(req.getAdminEmail())
                .referralCode(referralCode)
                .termsAcceptedAt(java.time.LocalDateTime.now())
                .termsVersion("1.0")
                .build();
        if ("BASIC".equalsIgnoreCase(plan)) {
            tenant.setPlanExpiresAt(java.time.LocalDateTime.of(9999, 12, 31, 23, 59, 59));
        }
        tenantRepository.save(tenant);

        // Apply promo or referral code if provided
        promotionService.applyPromoToTenant(tenant, req.getPromoCode());
        tenantRepository.save(tenant);

        // Create admin user for this org
        String username = req.getAdminUsername() != null && !req.getAdminUsername().isBlank()
                ? req.getAdminUsername().toLowerCase()
                : generateUsername(req.getAdminEmail(), req.getSlug());
        if (userRepository.existsByUsername(username)) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                    "Username '" + username + "' is already taken", HttpStatus.CONFLICT);
        }

        // Generate a temp password (admin sets their real password on first activation)
        String rawPassword = (req.getAdminPassword() != null && !req.getAdminPassword().isBlank())
                ? req.getAdminPassword()
                : generateTempPassword();
        User admin = User.builder()
                .username(username)
                .email(req.getAdminEmail())
                .fullName(req.getAdminFullName())
                .phone(req.getAdminPhone())
                .phoneCountryCode(req.getAdminPhoneCountryCode())
                .passwordHash(passwordEncoder.encode(rawPassword))
                .tempPasswordHash(passwordEncoder.encode(rawPassword))
                .mustChangePassword(false)
                .emailVerificationRequired(true)
                .role(Role.ADMIN)
                .tenantId(tenant.getId().toString())
                .termsAcceptedAt(java.time.LocalDateTime.now())
                .termsVersion("1.0")
                .build();
        userRepository.save(admin);

        try {
            String html = EmailService.buildRegistrationConfirmationHtml(
                    req.getAdminFullName(), req.getOrgName(), req.getSlug(), plan);
            String text = EmailService.buildRegistrationConfirmationText(
                    req.getAdminFullName(), req.getOrgName(), req.getSlug(), plan);
            notificationEventPublisher.publishEmail(
                    req.getAdminEmail(),
                    "Your ChitWise registration is under review — " + req.getOrgName(),
                    html, text);
        } catch (Exception e) {
            log.warn("Registration confirmation email could not be queued for {}: {}", req.getAdminEmail(), e.getMessage());
        }

        return toResponse(tenant);
    }

    // ── Tenant info helpers used by AuthService ──────────────────────────────

    public List<TenantInfo> buildTenantInfoList(UUID userId) {
        User user = userRepository.findById(userId).orElse(null);
        if (user == null) return List.of();

        // MEMBER role — a link row existing means access is granted; revoke deletes the row
        if (user.getRole() == Role.MEMBER) {
            List<MemberUserLink> links = memberLinkRepository.findAllByUserId(userId);
            return links.stream()
                    .map(l -> buildTenantInfo(l.getTenantId(), Role.MEMBER.name(), l.getMemberId().toString()))
                    .filter(java.util.Objects::nonNull)
                    .toList();
        }

        // ADMIN / MANAGER / STAFF — tenantId is on the user row directly
        if (user.getTenantId() == null) return List.of();
        UUID tenantId = UUID.fromString(user.getTenantId());
        TenantInfo info = buildTenantInfo(tenantId, user.getRole().name(), null);
        return info != null ? List.of(info) : List.of();
    }

    private TenantInfo buildTenantInfo(UUID tenantId, String role, String memberId) {
        Tenant t = tenantRepository.findById(tenantId).orElse(null);
        if (t == null) return null;
        String planCode = t.getPlan() != null ? t.getPlan().toUpperCase() : "BASIC";
        java.util.List<String> caps = resolveCapabilitiesForTenant(t.getId().toString());
        return TenantInfo.builder()
                .tenantId(t.getId().toString())
                .name(t.getName())
                .slug(t.getSlug())
                .plan(t.getPlan() != null ? t.getPlan().toUpperCase() : "BASIC")
                .status(t.getStatus() != null ? t.getStatus() : "ACTIVE")
                .planExpiresAt(t.getPlanExpiresAt())
                .role(role)
                .memberId(memberId)
                .analyticsEnabled(caps.contains("full_analytics"))
                .chatEnabled(caps.contains("live_chat"))
                .settlementEnabled(caps.contains("settlement"))
                .adminPhone(t.getContactPhone())
                .adminEmail(t.getContactEmail())
                .build();
    }

    // ── Super-admin operations ───────────────────────────────────────────────

    public List<TenantResponse> listAllTenants() {
        return tenantRepository.findAllByOrderByCreatedAtDesc()
                .stream().map(this::toResponse).toList();
    }

    public TenantResponse getTenant(UUID tenantId) {
        Tenant t = tenantRepository.findById(tenantId)
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND, "Tenant not found"));
        return toResponse(t);
    }

    public ActivationResponse activateTenant(UUID tenantId, String actorId) {
        Tenant t = tenantRepository.findByIdForUpdate(tenantId)
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND, "Tenant not found"));
        String planCode = t.getPlan() != null ? t.getPlan().trim().toUpperCase() : "BASIC";
        PlanLimits planLimits = planLimitsRepository.findById(planCode)
                .filter(PlanLimits::isActive)
                .orElseThrow(() -> new BusinessException(ErrorCode.VALIDATION_FAILED,
                        "The assigned subscription plan is missing or inactive"));
        String prevStatus = t.getStatus();
        applyAssignmentExpiry(t, planCode);
        t.setStatus("ACTIVE");
        tenantRepository.save(t);

        // Ensure a limits row exists (seed from plan if not already set)
        if (!customLimitsRepository.existsById(tenantId.toString())) {
            seedLimitsFromPlan(tenantId.toString(), planLimits);
        }

        promotionService.onTenantActivated(tenantId);
        auditClient.log("TENANT", tenantId.toString(),
                "TENANT_ACTIVATED", actorId, "ROLE_SUPER_ADMIN",
                java.util.Map.of("status", prevStatus != null ? prevStatus : "PENDING"),
                java.util.Map.of("status", "ACTIVE", "plan", planCode,
                        "planExpiresAt", t.getPlanExpiresAt().toString()),
                tenantId.toString());

        // Check if an ADMIN user already exists for this org
        List<User> admins = userRepository.findByTenantIdAndRoleInAndDeletedAtIsNull(
                tenantId.toString(), List.of(Role.ADMIN));

        if (!admins.isEmpty()) {
            User existingAdmin = admins.get(0);
            try {
                String html = EmailService.buildApprovalEmailHtml(
                        existingAdmin.getFullName(), t.getName(), t.getSlug(), existingAdmin.getUsername(), null, planLimits);
                String text = EmailService.buildApprovalEmailText(
                        existingAdmin.getFullName(), t.getName(), t.getSlug(), existingAdmin.getUsername(), null, planLimits);
                notificationEventPublisher.publishEmail(
                        t.getContactEmail(),
                        "Your ChitWise account is now active — " + t.getName(),
                        html, text);
            } catch (Exception e) {
                log.warn("Approval email could not be queued for tenant {}: {}", tenantId, e.getMessage());
            }
            return ActivationResponse.builder()
                    .tenant(toResponse(t))
                    .adminUsername(existingAdmin.getUsername())
                    .adminTempPassword(null)
                    .adminUserId(existingAdmin.getId().toString())
                    .adminAlreadyExisted(true)
                    .build();
        }

        // Auto-create admin account
        if (t.getContactEmail() == null || t.getContactEmail().isBlank()) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                    "An organization email is required before an admin can be created");
        }
        String rawPassword = generateTempPassword();
        String username = t.getSlug() + ".admin";
        int s = 1;
        while (userRepository.existsByUsername(username)) {
            username = t.getSlug() + ".admin" + s++;
        }

        User admin = User.builder()
                .username(username)
                .fullName(t.getName() + " Admin")
                .email(t.getContactEmail())
                .phone(t.getContactPhone())
                .phoneCountryCode("+91")
                .passwordHash(passwordEncoder.encode(rawPassword))
                .tempPasswordHash(passwordEncoder.encode(rawPassword))
                .mustChangePassword(true)
                .emailVerificationRequired(true)
                .role(Role.ADMIN)
                .tenantId(tenantId.toString())
                .build();
        userRepository.save(admin);

        try {
            String html = EmailService.buildApprovalEmailHtml(
                    admin.getFullName(), t.getName(), t.getSlug(), username, rawPassword, planLimits);
            String text = EmailService.buildApprovalEmailText(
                    admin.getFullName(), t.getName(), t.getSlug(), username, rawPassword, planLimits);
            notificationEventPublisher.publishEmail(
                    t.getContactEmail(),
                    "Your ChitWise account is approved — login credentials inside",
                    html, text);
        } catch (Exception e) {
            log.warn("Approval email with credentials could not be queued for tenant {}: {}", tenantId, e.getMessage());
        }

        return ActivationResponse.builder()
                .tenant(toResponse(t))
                .adminUsername(username)
                .adminTempPassword(rawPassword)
                .adminUserId(admin.getId().toString())
                .adminAlreadyExisted(false)
                .build();
    }

    public TenantResponse suspendTenant(UUID tenantId, String actorId) {
        Tenant t = tenantRepository.findById(tenantId)
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND, "Tenant not found"));
        String previous = t.getStatus();
        t.setStatus("SUSPENDED");
        tenantRepository.save(t);
        auditClient.log("TENANT", tenantId.toString(),
                "TENANT_SUSPENDED", actorId, "ROLE_SUPER_ADMIN",
                java.util.Map.of("status", previous != null ? previous : "UNKNOWN"),
                java.util.Map.of("status", "SUSPENDED"), tenantId.toString());
        sendStatusEmail(t, "SUSPENDED");
        return toResponse(t);
    }

    private static final java.util.Set<String> RESERVED_SLUGS = java.util.Set.of(
            "hub", "www", "api", "app", "mail", "admin", "support", "help",
            "status", "cdn", "static", "assets", "login", "signup", "register",
            "dashboard", "billing", "dev", "staging", "test", "demo"
    );

    public boolean slugExists(String slug) {
        if (RESERVED_SLUGS.contains(slug.toLowerCase())) return true;
        return tenantRepository.existsBySlugAndStatusNot(slug, "REJECTED");
    }

    public TenantResponse setTenantStatus(UUID tenantId, String newStatus, String actorId) {
        String upper = newStatus.toUpperCase();
        if (!java.util.Set.of("PENDING", "ACTIVE", "SUSPENDED", "REJECTED").contains(upper)) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED, "Invalid status: " + newStatus);
        }
        Tenant t = tenantRepository.findById(tenantId)
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND, "Tenant not found"));
        String prevStatus = t.getStatus();
        t.setStatus(upper);
        tenantRepository.save(t);
        auditClient.log("TENANT", tenantId.toString(),
                "STATUS_CHANGED", actorId, "ROLE_SUPER_ADMIN",
                java.util.Map.of("status", prevStatus != null ? prevStatus : "UNKNOWN"),
                java.util.Map.of("status", upper),
                tenantId.toString());
        if (!upper.equals(prevStatus)) {
            sendStatusEmail(t, upper);
        }
        return toResponse(t);
    }

    public TenantResponse reactivateTenant(UUID tenantId, String newSlug, String actorId) {
        Tenant t = tenantRepository.findById(tenantId)
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND, "Tenant not found"));
        if (!"REJECTED".equals(t.getStatus())) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED, "Only rejected tenants can be reactivated");
        }
        String targetSlug = (newSlug != null && !newSlug.isBlank()) ? newSlug.toLowerCase().trim() : t.getSlug();
        if (RESERVED_SLUGS.contains(targetSlug)) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                    "Subdomain '" + targetSlug + "' is reserved and cannot be used", HttpStatus.CONFLICT);
        }
        // Check slug availability (excluding this tenant itself and other REJECTED tenants)
        boolean slugTaken = tenantRepository.existsBySlugAndStatusNot(targetSlug, "REJECTED")
                || tenantRepository.findAllByStatusOrderByCreatedAtDesc("REJECTED").stream()
                   .anyMatch(other -> !other.getId().equals(tenantId) && targetSlug.equals(other.getSlug()));
        if (slugTaken) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                    "Subdomain '" + targetSlug + "' is already taken — please choose another", HttpStatus.CONFLICT);
        }
        String previousSlug = t.getSlug();
        String previousStatus = t.getStatus();
        t.setSlug(targetSlug);
        t.setStatus("PENDING");
        tenantRepository.save(t);
        auditClient.log("TENANT", tenantId.toString(),
                "TENANT_REACTIVATED", actorId, "ROLE_SUPER_ADMIN",
                java.util.Map.of("status", previousStatus, "slug", previousSlug),
                java.util.Map.of("status", "PENDING", "slug", targetSlug), tenantId.toString());
        return toResponse(t);
    }

    public TenantResponse updatePlan(UUID tenantId, String plan, String actorId, String reason) {
        String auditReason = requireEntitlementReason(reason);
        Tenant t = tenantRepository.findByIdForUpdate(tenantId)
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND, "Tenant not found"));
        String targetPlan = plan == null ? "" : plan.trim().toUpperCase(java.util.Locale.ROOT);
        PlanLimits targetLimits = planLimitsRepository.findById(targetPlan)
                .filter(PlanLimits::isActive)
                .orElseThrow(() -> new BusinessException(ErrorCode.VALIDATION_FAILED,
                        "Active plan not found: " + targetPlan));
        java.util.Map<String, Object> before = entitlementSnapshot(t.getPlan(),
                customLimitsRepository.findById(tenantId.toString()).orElse(null), t.getPlanExpiresAt());
        applyAssignmentExpiry(t, targetPlan);
        t.setPlan(targetPlan);
        t.setRequestedPlan(null);
        t.setUpgradeRequestedAt(null);
        tenantRepository.save(t);
        // This row is the effective source used by member/chit services. Keep
        // it in the same transaction as the tenant plan assignment so an
        // upgrade or downgrade cannot expose stale limits.
        seedLimitsFromPlan(tenantId.toString(), targetLimits);
        auditClient.log("TENANT", tenantId.toString(),
                "PLAN_CHANGED", actorId, "ROLE_SUPER_ADMIN",
                before, entitlementSnapshot(targetPlan,
                        customLimitsRepository.findById(tenantId.toString()).orElse(null), t.getPlanExpiresAt()),
                tenantId.toString(), auditReason);
        return toResponse(t);
    }

    @Transactional
    public void requestPlanUpgrade(String tenantId, String toPlan, String actorId) {
        String targetPlan = toPlan == null ? "" : toPlan.trim().toUpperCase(java.util.Locale.ROOT);
        PlanLimits target = planLimitsRepository.findById(targetPlan)
                .filter(plan -> plan.isActive() && plan.isPublic())
                .orElseThrow(() -> new BusinessException(ErrorCode.VALIDATION_FAILED,
                        "Public active plan not found: " + targetPlan));
        Tenant t = tenantRepository.findByIdForUpdate(UUID.fromString(tenantId))
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND, "Tenant not found"));
        PlanLimits current = planLimitsRepository.findById(
                        t.getPlan() == null ? "" : t.getPlan().trim().toUpperCase(java.util.Locale.ROOT))
                .orElseThrow(() -> new BusinessException(ErrorCode.VALIDATION_FAILED,
                        "Organization subscription plan is invalid"));
        if (target.getPlan().equalsIgnoreCase(current.getPlan())
                || target.getPriceMonthlyInr() <= current.getPriceMonthlyInr()) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                    "Upgrade requests must select a higher-priced active plan");
        }
        if (targetPlan.equalsIgnoreCase(t.getRequestedPlan())) {
            return;
        }
        String previousRequest = t.getRequestedPlan();
        t.setRequestedPlan(targetPlan);
        t.setUpgradeRequestedAt(java.time.LocalDateTime.now());
        tenantRepository.save(t);
        auditClient.log("TENANT", tenantId,
                "PLAN_UPGRADE_REQUESTED", actorId, "ROLE_ADMIN",
                java.util.Map.of("requestedPlan", previousRequest != null ? previousRequest : "none"),
                java.util.Map.of("requestedPlan", targetPlan), tenantId);
    }

    public List<TenantResponse> listPendingUpgradeRequests() {
        return tenantRepository.findAllByRequestedPlanIsNotNullOrderByUpgradeRequestedAtAsc()
                .stream().map(this::toResponse).toList();
    }

    public List<TenantResponse> listPendingRenewalRequests() {
        return tenantRepository.findAllByRenewalRequestedAtIsNotNullOrderByRenewalRequestedAtAsc()
                .stream().map(this::toResponse).toList();
    }

    public void clearRenewalRequest(UUID tenantId, String actorId) {
        tenantRepository.findById(tenantId).ifPresent(t -> {
            t.setRenewalRequestedAt(null);
            tenantRepository.save(t);
        });
        auditClient.log("TENANT", tenantId.toString(),
                "RENEWAL_APPROVED", actorId, "ROLE_SUPER_ADMIN",
                null, null, tenantId.toString());
    }

    public void requestRenewal(String tenantId, String actorId) {
        Tenant t = tenantRepository.findByIdForUpdate(UUID.fromString(tenantId))
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND, "Tenant not found"));
        if ("BASIC".equalsIgnoreCase(t.getPlan())) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                    "The free Basic plan does not require renewal");
        }
        if (t.getRenewalRequestedAt() != null) {
            return;
        }
        t.setRenewalRequestedAt(java.time.LocalDateTime.now());
        tenantRepository.save(t);
        auditClient.log("TENANT", tenantId,
                "RENEWAL_REQUESTED", actorId, "ROLE_ADMIN",
                null, java.util.Map.of("plan", t.getPlan() != null ? t.getPlan() : "BASIC"),
                tenantId);

        // Notify all super-admin accounts
        userRepository.findByRoleIn(java.util.List.of(com.chitfund.userservice.domain.enums.Role.SUPER_ADMIN))
                .forEach(admin -> notificationEventPublisher.publishInApp(
                        null, admin.getId(),
                        "Renewal Request",
                        t.getName() + " (" + t.getPlan() + " plan) has requested a renewal.",
                        "RENEWAL_REQUEST", null,
                        "/superadmin/tenants/" + tenantId));
    }

    public TenantResponse setPlanExpiry(UUID tenantId, java.time.LocalDateTime expiresAt,
                                        String actorId, String reason) {
        String auditReason = requireEntitlementReason(reason);
        Tenant t = tenantRepository.findById(tenantId)
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND, "Tenant not found"));
        java.time.LocalDateTime prev = t.getPlanExpiresAt();
        t.setPlanExpiresAt(expiresAt);
        t.setRenewalRequestedAt(null); // clear renewal request when expiry is updated
        tenantRepository.save(t);
        auditClient.log("TENANT", tenantId.toString(),
                "PLAN_EXPIRY_SET", actorId, "ROLE_SUPER_ADMIN",
                java.util.Map.of("planExpiresAt", prev != null ? prev.toString() : "none"),
                java.util.Map.of("planExpiresAt", expiresAt != null ? expiresAt.toString() : "none"),
                tenantId.toString(), auditReason);
        return toResponse(t);
    }

    // ── Super-admin org detail operations ───────────────────────────────────

    public List<OrgUserResponse> listOrgUsers(UUID tenantId) {
        tenantRepository.findById(tenantId)
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND, "Tenant not found"));

        // Non-member users (ADMIN, MANAGER, STAFF) — role + tenantId live on users table
        List<OrgUserResponse> staffUsers = userRepository
                .findByTenantIdAndRoleInAndDeletedAtIsNull(tenantId.toString(),
                        List.of(Role.ADMIN, Role.MANAGER, Role.STAFF))
                .stream()
                .map(u -> OrgUserResponse.builder()
                        .userId(u.getId().toString())
                        .username(u.getUsername())
                        .fullName(u.getFullName())
                        .email(u.getEmail())
                        .phone(u.getPhone())
                        .role(u.getRole().name())
                        .enabled(u.isEnabled())
                        .locked(u.isLocked())
                        .hasAppAccess(u.isHasAppAccess())
                        .mustChangePassword(u.isMustChangePassword())
                        .joinedAt(u.getCreatedAt())
                        .lastLoginAt(u.getLastLoginAt())
                        .build())
                .toList();

        // Member users — get link row for memberId, user row for profile
        List<OrgUserResponse> memberUsers = memberLinkRepository.findAllByTenantId(tenantId)
                .stream()
                .map(link -> {
                    User u = userRepository.findById(link.getUserId()).orElse(null);
                    if (u == null) return null;
                    return OrgUserResponse.builder()
                            .userId(u.getId().toString())
                            .membershipId(link.getId().toString())
                            .username(u.getUsername())
                            .fullName(u.getFullName())
                            .email(u.getEmail())
                            .phone(u.getPhone())
                            .role(Role.MEMBER.name())
                            .memberId(link.getMemberId().toString())
                            .enabled(u.isEnabled())
                            .locked(u.isLocked())
                            .hasAppAccess(u.isHasAppAccess())
                            .mustChangePassword(u.isMustChangePassword())
                            .joinedAt(link.getCreatedAt())
                            .lastLoginAt(u.getLastLoginAt())
                            .build();
                })
                .filter(java.util.Objects::nonNull)
                .toList();

        return java.util.stream.Stream.concat(staffUsers.stream(), memberUsers.stream()).toList();
    }

    public TenantResponse updateTenant(UUID tenantId, UpdateTenantRequest req, String actorId) {
        Tenant t = tenantRepository.findById(tenantId)
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND, "Tenant not found"));
        java.util.Map<String, Object> before = tenantAuditSnapshot(t);
        t.setName(req.getName().trim());
        if (req.getSlug() != null && !req.getSlug().isBlank()) {
            String newSlug = req.getSlug().toLowerCase().trim();
            if (RESERVED_SLUGS.contains(newSlug)) {
                throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                        "Subdomain '" + newSlug + "' is reserved and cannot be used", HttpStatus.CONFLICT);
            }
            if (!newSlug.equals(t.getSlug()) && tenantRepository.existsBySlug(newSlug)) {
                throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                        "Subdomain '" + newSlug + "' is already taken", HttpStatus.CONFLICT);
            }
            t.setSlug(newSlug);
        }
        if (req.getBusinessRegNumber() != null) {
            t.setBusinessRegNumber(req.getBusinessRegNumber().isBlank() ? null : req.getBusinessRegNumber().trim());
        }
        if (req.getSupportPhoneNumber() != null) {
            t.setSupportPhoneNumber(req.getSupportPhoneNumber().isBlank() ? null : req.getSupportPhoneNumber().trim());
        }
        tenantRepository.save(t);
        auditClient.log("TENANT", tenantId.toString(),
                "TENANT_DETAILS_UPDATED", actorId, "ROLE_SUPER_ADMIN",
                before, tenantAuditSnapshot(t), tenantId.toString());
        return toResponse(t);
    }

    public TenantResponse updateAdminOrgDetails(String tenantId, String orgName, String businessRegNumber) {
        Tenant t = tenantRepository.findById(UUID.fromString(tenantId))
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND, "Tenant not found"));
        if (orgName != null && !orgName.isBlank()) t.setName(orgName.trim());
        if (businessRegNumber != null) {
            t.setBusinessRegNumber(businessRegNumber.isBlank() ? null : businessRegNumber.trim());
        }
        tenantRepository.save(t);
        return toResponse(t);
    }

    public OrgUserResponse addOrgUser(UUID tenantId, AddOrgUserRequest req, String actorId) {
        tenantRepository.findById(tenantId)
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND, "Tenant not found"));
        Role role = Role.valueOf(req.getRole().toUpperCase());
        if (role != Role.ADMIN && role != Role.MANAGER && role != Role.STAFF) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                    "Role must be ADMIN, MANAGER, or STAFF");
        }

        // Generate a temp password if not provided
        String rawPassword = (req.getPassword() != null && !req.getPassword().isBlank())
                ? req.getPassword()
                : generateTempPassword();

        // Generate username: phone-based
        String baseUsername = req.getPhone().replaceAll("[^0-9]", "");
        String candidate = baseUsername;
        int s = 1;
        while (userRepository.existsByUsername(candidate)) {
            candidate = baseUsername + s++;
        }

        User user = User.builder()
                .username(candidate)
                .fullName(req.getFullName())
                .phone(req.getPhone())
                .phoneCountryCode(req.getPhoneCountryCode() != null ? req.getPhoneCountryCode() : "+91")
                .email(req.getEmail())
                .passwordHash(passwordEncoder.encode(rawPassword))
                .tempPasswordHash(passwordEncoder.encode(rawPassword))
                .mustChangePassword(true)
                .emailVerificationRequired(true)
                .role(role)
                .tenantId(tenantId.toString())
                .build();
        userRepository.save(user);

        auditClient.log("USER", user.getId().toString(),
                "ORG_USER_CREATED", actorId, "ROLE_SUPER_ADMIN", null,
                java.util.Map.of("tenantId", tenantId.toString(), "role", role.name()),
                tenantId.toString());

        return OrgUserResponse.builder()
                .userId(user.getId().toString())
                .username(user.getUsername())
                .fullName(user.getFullName())
                .email(user.getEmail())
                .phone(user.getPhone())
                .role(role.name())
                .enabled(true)
                .joinedAt(user.getCreatedAt())
                .tempPassword(rawPassword)
                .build();
    }

    public com.chitfund.userservice.dto.response.ResetPasswordResponse setupAppAccess(UUID userId, String username) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND, "User not found"));
        if (username != null && !username.isBlank()) {
            String trimmed = username.trim();
            if (!trimmed.equals(user.getUsername()) && userRepository.existsByUsername(trimmed)) {
                throw new BusinessException(ErrorCode.USERNAME_TAKEN, "Username already taken");
            }
            user.setUsername(trimmed);
        }
        String chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
        java.security.SecureRandom random = new java.security.SecureRandom();
        StringBuilder sb = new StringBuilder(10);
        for (int i = 0; i < 10; i++) sb.append(chars.charAt(random.nextInt(chars.length())));
        String tempPassword = sb.toString();
        user.setTempPasswordHash(passwordEncoder.encode(tempPassword));
        user.setMustChangePassword(true);
        user.setHasAppAccess(true);
        user.setEnabled(true);
        userRepository.save(user);
        return com.chitfund.userservice.dto.response.ResetPasswordResponse.builder()
                .userId(user.getId())
                .username(user.getUsername())
                .tempPassword(tempPassword)
                .build();
    }

    @Transactional(readOnly = true)
    public OrgUserResponse getAdminCredentials(UUID tenantId) {
        tenantRepository.findById(tenantId)
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND, "Tenant not found"));

        User admin = userRepository
                .findByTenantIdAndRoleInAndDeletedAtIsNull(tenantId.toString(), List.of(Role.ADMIN))
                .stream().findFirst()
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND,
                        "No admin user found for this org"));

        return OrgUserResponse.builder()
                .userId(admin.getId().toString())
                .username(admin.getUsername())
                .fullName(admin.getFullName())
                .email(admin.getEmail())
                .phone(admin.getPhone())
                .role(Role.ADMIN.name())
                .enabled(admin.isEnabled())
                .joinedAt(admin.getCreatedAt())
                .tempPassword(null)
                .build();
    }

    // ── Custom plan limits ───────────────────────────────────────────────────

    public EffectiveLimitsResponse setCustomLimits(UUID tenantId, SetCustomLimitsRequest req,
                                                    String actorId, String reason) {
        String auditReason = requireEntitlementReason(reason);
        Tenant t = tenantRepository.findByIdForUpdate(tenantId)
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND, "Tenant not found"));

        TenantCustomLimits limits = customLimitsRepository.findById(tenantId.toString())
                .orElse(TenantCustomLimits.builder().tenantId(tenantId.toString()).build());
        java.util.Map<String, Object> before = entitlementSnapshot(t.getPlan(), limits, t.getPlanExpiresAt());
        limits.setMaxActiveChits(req.getMaxActiveChits());
        limits.setMaxMembers(req.getMaxMembers());
        limits.setMaxStaff(req.getMaxStaff());
        limits.setAllowedChitTypes(PlanInputValidator.normalizeAllowedChitTypes(req.getAllowedChitTypes()));
        limits.setPriceMonthlyInr(req.getPriceMonthlyInr());
        limits.setPlanCode("CUSTOM");
        limits.setNotes(req.getNotes());
        // A custom plan is an explicit allow-list. Omitting the field must not
        // inherit capabilities copied from the tenant's previous standard plan.
        java.util.List<String> validatedCapabilities = req.getEnabledCapabilities() != null
                ? validateCapabilityKeys(req.getEnabledCapabilities())
                : java.util.List.of();
        limits.setCapabilities(serializeCapabilityKeys(validatedCapabilities));
        customLimitsRepository.save(limits);

        // Automatically set plan to CUSTOM
        applyAssignmentExpiry(t, "CUSTOM");
        t.setPlan("CUSTOM");
        t.setRequestedPlan(null);
        t.setUpgradeRequestedAt(null);
        tenantRepository.save(t);

        auditClient.log("TENANT", tenantId.toString(),
                "CUSTOM_LIMITS_SET", actorId, "ROLE_SUPER_ADMIN",
                before, entitlementSnapshot("CUSTOM", limits, t.getPlanExpiresAt()),
                tenantId.toString(), auditReason);

        return toEffectiveLimits(limits, t.getStatus(), t.getPlanExpiresAt(),
                validatedCapabilities);
    }

    public void removeCustomLimits(UUID tenantId, String fallbackPlan, String actorId, String reason) {
        String auditReason = requireEntitlementReason(reason);
        String planCode = fallbackPlan != null
                ? fallbackPlan.trim().toUpperCase(java.util.Locale.ROOT) : "BASIC";
        PlanLimits plan = planLimitsRepository.findById(planCode)
                .filter(PlanLimits::isActive)
                .orElseThrow(() -> new BusinessException(ErrorCode.VALIDATION_FAILED,
                        "Active fallback plan not found: " + planCode));
        Tenant t = tenantRepository.findByIdForUpdate(tenantId)
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND, "Tenant not found"));
        java.util.Map<String, Object> before = entitlementSnapshot(t.getPlan(),
                customLimitsRepository.findById(tenantId.toString()).orElse(null), t.getPlanExpiresAt());
        // Reset limits row to plan defaults (never delete — always keep a row)
        seedLimitsFromPlan(tenantId.toString(), plan);
        applyAssignmentExpiry(t, planCode);
        t.setPlan(planCode);
        tenantRepository.save(t);
        auditClient.log("TENANT", tenantId.toString(),
                "CUSTOM_LIMITS_REMOVED", actorId, "ROLE_SUPER_ADMIN",
                before, entitlementSnapshot(planCode,
                        customLimitsRepository.findById(tenantId.toString()).orElse(null), t.getPlanExpiresAt()),
                tenantId.toString(), auditReason);
    }

    private static String requireEntitlementReason(String reason) {
        String normalized = reason == null ? "" : reason.trim();
        if (normalized.length() < 5) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                    "A reason of at least 5 characters is required for entitlement changes");
        }
        return normalized;
    }

    private static java.util.Map<String, Object> entitlementSnapshot(
            String planCode, TenantCustomLimits limits, java.time.LocalDateTime planExpiresAt) {
        java.util.Map<String, Object> snapshot = new java.util.LinkedHashMap<>();
        snapshot.put("plan", planCode != null ? planCode : "UNASSIGNED");
        snapshot.put("planExpiresAt", planExpiresAt != null ? planExpiresAt.toString() : "none");
        if (limits != null) {
            snapshot.put("maxActiveChits", limits.getMaxActiveChits());
            snapshot.put("maxMembers", limits.getMaxMembers());
            snapshot.put("maxStaff", limits.getMaxStaff());
            snapshot.put("allowedChitTypes", limits.getAllowedChitTypes());
            snapshot.put("priceMonthlyInr", limits.getPriceMonthlyInr());
            snapshot.put("capabilities", limits.getCapabilities());
        }
        return snapshot;
    }

    private static void applyAssignmentExpiry(Tenant tenant, String targetPlan) {
        if ("BASIC".equalsIgnoreCase(targetPlan)) {
            tenant.setPlanExpiresAt(FREE_PLAN_EXPIRY);
            return;
        }
        java.time.LocalDateTime current = tenant.getPlanExpiresAt();
        // Null historically meant unlimited, and BASIC uses a year-9999 sentinel.
        // Neither may leak into a paid/custom entitlement during a manual change.
        if (current == null || current.getYear() >= 9000) {
            tenant.setPlanExpiresAt(java.time.LocalDateTime.now().plusDays(MANUAL_PAID_PLAN_DAYS));
        }
    }

    private static java.util.Map<String, Object> standardPlanSnapshot(PlanLimits plan) {
        java.util.Map<String, Object> snapshot = new java.util.LinkedHashMap<>();
        snapshot.put("plan", plan.getPlan());
        snapshot.put("maxActiveChits", plan.getMaxActiveChits());
        snapshot.put("maxMembers", plan.getMaxMembers());
        snapshot.put("maxStaff", plan.getMaxStaff());
        snapshot.put("allowedChitTypes", plan.getAllowedChitTypes());
        snapshot.put("priceMonthlyInr", plan.getPriceMonthlyInr());
        snapshot.put("capabilities", plan.getCapabilities());
        return snapshot;
    }

    private java.util.List<String> validateCapabilityKeys(java.util.List<String> requested) {
        java.util.List<String> normalized = requested.stream()
                .filter(java.util.Objects::nonNull)
                .map(value -> value.trim().toLowerCase(java.util.Locale.ROOT))
                .filter(value -> !value.isBlank())
                .distinct()
                .toList();
        java.util.Set<String> known = capabilityDefRepository.findAllById(normalized).stream()
                .map(com.chitfund.userservice.domain.entity.PlanCapabilityDef::getKey)
                .collect(java.util.stream.Collectors.toSet());
        java.util.List<String> unknown = normalized.stream()
                .filter(key -> !known.contains(key)).toList();
        if (!unknown.isEmpty()) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                    "Unknown capability keys: " + String.join(", ", unknown));
        }
        return normalized;
    }

    private String serializeCapabilityKeys(java.util.List<String> capabilities) {
        if (capabilities == null || capabilities.isEmpty()) return "[]";
        try {
            return objectMapper.writeValueAsString(capabilities);
        } catch (com.fasterxml.jackson.core.JsonProcessingException exception) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                    "Capabilities could not be saved safely");
        }
    }

    @Transactional(readOnly = true)
    public EffectiveLimitsResponse getEffectiveLimits(String tenantId) {
        TenantCustomLimits limits = customLimitsRepository.findById(tenantId)
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND, "Tenant not found"));
        Tenant tenant = tenantRepository.findById(java.util.UUID.fromString(tenantId))
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND, "Tenant not found"));
        String assignedPlan = tenant.getPlan() == null
                ? "" : tenant.getPlan().trim().toUpperCase(java.util.Locale.ROOT);
        String limitsPlan = limits.getPlanCode() == null
                ? "" : limits.getPlanCode().trim().toUpperCase(java.util.Locale.ROOT);
        if (assignedPlan.isBlank() || !assignedPlan.equals(limitsPlan)) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                    "Organization subscription configuration is inconsistent");
        }
        boolean activeSubscription = "ACTIVE".equalsIgnoreCase(tenant.getStatus())
                && (tenant.getPlanExpiresAt() == null
                    || !tenant.getPlanExpiresAt().isBefore(java.time.LocalDateTime.now()));
        java.util.List<String> caps = activeSubscription ? resolveCaps(limits) : java.util.List.of();
        return toEffectiveLimits(limits, tenant.getStatus(), tenant.getPlanExpiresAt(), caps);
    }

    @Transactional(readOnly = true)
    public List<java.util.Map<String, Object>> getAllTenantLimits() {
        return customLimitsRepository.findAll().stream()
                .map(c -> java.util.Map.<String, Object>of(
                        "tenantId", c.getTenantId(),
                        "maxActiveChits", c.getMaxActiveChits(),
                        "maxMembers", c.getMaxMembers(),
                        "maxStaff", c.getMaxStaff()
                ))
                .toList();
    }

    private EffectiveLimitsResponse toEffectiveLimits(TenantCustomLimits c, String tenantStatus,
                                                      java.time.LocalDateTime planExpiresAt,
                                                      java.util.List<String> caps) {
        return EffectiveLimitsResponse.builder()
                .plan(c.getPlanCode())
                .tenantStatus(tenantStatus)
                .isCustom("CUSTOM".equals(c.getPlanCode()))
                .maxActiveChits(c.getMaxActiveChits())
                .maxMembers(c.getMaxMembers())
                .maxStaff(c.getMaxStaff())
                .enabledCapabilities(caps)
                .analyticsEnabled(caps.contains("full_analytics"))
                .prioritySupport(caps.contains("priority_support"))
                .chatEnabled(caps.contains("live_chat"))
                .settlementEnabled(caps.contains("settlement"))
                .allowedChitTypes(c.getAllowedChitTypes())
                .priceMonthlyInr(c.getPriceMonthlyInr())
                .notes(c.getNotes())
                .planExpiresAt(planExpiresAt != null ? planExpiresAt.toString() : null)
                .build();
    }

    /** Resolves capabilities for a tenant_custom_limits row.
     *  CUSTOM plan: use the row's own capabilities.
     *  All other plans: use plan_limits.capabilities so that plan edits auto-apply. */
    private java.util.List<String> resolveCaps(TenantCustomLimits c) {
        if ("CUSTOM".equals(c.getPlanCode())) return CapabilityJson.parse(c.getCapabilities(), objectMapper);
        return planLimitsRepository.findById(c.getPlanCode())
                .map(p -> CapabilityJson.parse(p.getCapabilities(), objectMapper))
                .orElse(java.util.List.of());
    }

    /** Single authoritative resolution point used by buildTenantInfo and InternalCapabilityController. */
    public java.util.List<String> resolveCapabilitiesForTenant(String tenantId) {
        Tenant t = tenantRepository.findById(java.util.UUID.fromString(tenantId)).orElse(null);
        if (t == null) return java.util.List.of();
        if (!"ACTIVE".equalsIgnoreCase(t.getStatus())) return java.util.List.of();
        if (t.getPlanExpiresAt() != null && t.getPlanExpiresAt().isBefore(java.time.LocalDateTime.now())) {
            return java.util.List.of();
        }
        if (t.getPlan() == null || t.getPlan().isBlank()) return java.util.List.of();
        String planCode = t.getPlan().trim().toUpperCase(java.util.Locale.ROOT);
        if ("CUSTOM".equals(planCode)) {
            return customLimitsRepository.findById(tenantId)
                    .map(c -> CapabilityJson.parse(c.getCapabilities(), objectMapper))
                    .orElse(java.util.List.of());
        }
        return planLimitsRepository.findById(planCode)
                .map(p -> CapabilityJson.parse(p.getCapabilities(), objectMapper))
                .orElse(java.util.List.of());
    }

    void seedLimitsFromPlan(String tenantId, PlanLimits plan) {
        TenantCustomLimits limits = customLimitsRepository.findById(tenantId)
                .orElse(TenantCustomLimits.builder().tenantId(tenantId).build());
        limits.setMaxActiveChits(plan.getMaxActiveChits());
        limits.setMaxMembers(plan.getMaxMembers());
        limits.setMaxStaff(plan.getMaxStaff());
        limits.setCapabilities(plan.getCapabilities());
        limits.setAllowedChitTypes(plan.getAllowedChitTypes());
        limits.setPriceMonthlyInr(plan.getPriceMonthlyInr());
        limits.setPlanCode(plan.getPlan());
        limits.setNotes(null);
        customLimitsRepository.save(limits);
    }

    // ── Membership helpers ───────────────────────────────────────────────────

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void addUserToTenant(UUID userId, UUID tenantId, Role role, UUID memberId) {
        if (role != Role.MEMBER) return; // only members need a link row
        MemberUserLink existingForUser = memberLinkRepository.findByUserIdAndTenantId(userId, tenantId)
                .orElse(null);
        if (existingForUser != null) {
            if (existingForUser.getMemberId().equals(memberId)) return; // idempotent retry
            throw new BusinessException(ErrorCode.CONCURRENT_MODIFICATION,
                    "This account is already connected to a different member in this organization",
                    HttpStatus.CONFLICT);
        }
        memberLinkRepository.findByMemberIdAndTenantId(memberId, tenantId).ifPresent(existing -> {
            if (!existing.getUserId().equals(userId)) {
                throw new BusinessException(ErrorCode.CONCURRENT_MODIFICATION,
                        "This member is already connected to a different ChitWise account",
                        HttpStatus.CONFLICT);
            }
        });
        MemberUserLink link = MemberUserLink.builder()
                .userId(userId)
                .tenantId(tenantId)
                .memberId(memberId)
                .build();
        memberLinkRepository.saveAndFlush(link);
    }

    // ── Private helpers ──────────────────────────────────────────────────────

    // ── Billing info for org admin ───────────────────────────────────────────

    @Transactional(readOnly = true)
    public BillingInfoResponse getBillingInfo(UUID tenantId) {
        Tenant t = tenantRepository.findById(tenantId)
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND, "Tenant not found"));

        // Resolve base price: use tenant_custom_limits (always present per architecture) for org-specific pricing
        java.math.BigDecimal basePrice = customLimitsRepository.findById(tenantId.toString())
                .filter(l -> l.getPriceMonthlyInr() > 0)
                .map(l -> java.math.BigDecimal.valueOf(l.getPriceMonthlyInr()))
                .orElseGet(() -> planLimitsRepository.findById(
                        t.getPlan() != null ? t.getPlan().toUpperCase() : "BASIC")
                        .map(p -> java.math.BigDecimal.valueOf(p.getPriceMonthlyInr()))
                        .orElse(java.math.BigDecimal.ZERO));

        // Resolve applied discount
        java.math.BigDecimal discountPct = java.math.BigDecimal.ZERO;
        String promoLabel = null;
        String durationType = null;
        boolean discountActive = false;
        if (t.getAppliedPromoId() != null) {
            try {
                var promoOpt = promotionRepository.findById(java.util.UUID.fromString(t.getAppliedPromoId()));
                if (promoOpt.isPresent()) {
                    var promo = promoOpt.get();
                    // Check if discount is still active
                    boolean withinWindow = t.getPromoDiscountUntil() == null
                            || java.time.LocalDateTime.now().isBefore(t.getPromoDiscountUntil());
                    if (promo.isActive() && withinWindow) {
                        discountPct = promo.getDiscountPct() != null ? promo.getDiscountPct() : java.math.BigDecimal.ZERO;
                        promoLabel = promo.getLabel();
                        durationType = promo.getDiscountDurationType();
                        discountActive = true;
                    }
                }
            } catch (IllegalArgumentException ignored) { /* bad UUID */ }
        }

        java.math.BigDecimal effectivePrice = basePrice.multiply(
                java.math.BigDecimal.ONE.subtract(discountPct.divide(java.math.BigDecimal.valueOf(100))));
        // credit is stored in INR; convert to paise to match effectivePrice units
        java.math.BigDecimal creditInr = t.getCreditBalanceInr() != null ? t.getCreditBalanceInr() : java.math.BigDecimal.ZERO;
        java.math.BigDecimal creditPaise = creditInr.multiply(java.math.BigDecimal.valueOf(100));
        java.math.BigDecimal nextBilling = effectivePrice.subtract(creditPaise).max(java.math.BigDecimal.ZERO);

        String planLabel = switch (t.getPlan() != null ? t.getPlan().toUpperCase() : "BASIC") {
            case "GROWTH" -> "Growth";
            case "ENTERPRISE" -> "Enterprise";
            case "CUSTOM" -> "Custom";
            default -> "Basic";
        };

        return BillingInfoResponse.builder()
                .plan(t.getPlan())
                .planLabel(planLabel)
                .priceMonthlyInr(basePrice)
                .appliedDiscountPct(discountActive ? discountPct : java.math.BigDecimal.ZERO)
                .effectivePriceInr(effectivePrice)
                .promoLabel(promoLabel)
                .discountDurationType(durationType)
                .promoDiscountUntil(t.getPromoDiscountUntil())
                .creditBalanceInr(creditPaise)
                .nextBillingEstimate(nextBilling)
                .referralCode(t.getReferralCode())
                .planExpiresAt(t.getPlanExpiresAt())
                .cancellationRequestedAt(t.getCancellationRequestedAt())
                .build();
    }

    // ── Super-admin: manually add credit to a tenant ─────────────────────────

    @Transactional
    public TenantResponse addCredit(UUID tenantId, java.math.BigDecimal amountInr,
                                    String reason, String idempotencyKey, String actorId) {
        validateCreditAdjustment(amountInr, reason);
        Tenant t = tenantRepository.findByIdForUpdate(tenantId)
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND, "Tenant not found"));
        String fingerprint = creditAdjustmentFingerprint("ADD", tenantId, amountInr, reason);
        TenantResponse replay = replayCreditAdjustment(t, "ADD", idempotencyKey, fingerprint);
        if (replay != null) return replay;
        java.math.BigDecimal current = t.getCreditBalanceInr() != null ? t.getCreditBalanceInr() : java.math.BigDecimal.ZERO;
        java.math.BigDecimal newBalance = current.add(amountInr);
        t.setCreditBalanceInr(newBalance);
        TenantResponse result = toResponse(tenantRepository.save(t));
        TenantCreditAdjustment adjustment = saveCreditAdjustment(t, "ADD", amountInr, reason,
                idempotencyKey, fingerprint, current, newBalance, actorId);
        auditClient.log("TENANT_CREDIT_ADJUSTMENT", adjustment.getId(),
                "CREDIT_ADDED", actorId, "ROLE_SUPER_ADMIN",
                java.util.Map.of("creditBalanceInr", current.toPlainString()),
                java.util.Map.of("creditBalanceInr", newBalance.toPlainString(), "addedInr", amountInr.toPlainString()),
                tenantId.toString(), "HUB", "SUCCESS", reason.trim(),
                adjustment.getId(), idempotencyKey.trim());
        return result;
    }

    @Transactional
    public TenantResponse deductCredit(UUID tenantId, java.math.BigDecimal amountInr,
                                       String reason, String idempotencyKey, String actorId) {
        validateCreditAdjustment(amountInr, reason);
        Tenant t = tenantRepository.findByIdForUpdate(tenantId)
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND, "Tenant not found"));
        String fingerprint = creditAdjustmentFingerprint("DEDUCT", tenantId, amountInr, reason);
        TenantResponse replay = replayCreditAdjustment(t, "DEDUCT", idempotencyKey, fingerprint);
        if (replay != null) return replay;
        java.math.BigDecimal current = t.getCreditBalanceInr() != null ? t.getCreditBalanceInr() : java.math.BigDecimal.ZERO;
        if (amountInr.compareTo(current) > 0) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                    "Deduction cannot exceed the available credit balance");
        }
        java.math.BigDecimal newBalance = current.subtract(amountInr);
        t.setCreditBalanceInr(newBalance);
        TenantResponse result = toResponse(tenantRepository.save(t));
        TenantCreditAdjustment adjustment = saveCreditAdjustment(t, "DEDUCT", amountInr, reason,
                idempotencyKey, fingerprint, current, newBalance, actorId);
        auditClient.log("TENANT_CREDIT_ADJUSTMENT", adjustment.getId(),
                "CREDIT_DEDUCTED", actorId, "ROLE_SUPER_ADMIN",
                java.util.Map.of("creditBalanceInr", current.toPlainString()),
                java.util.Map.of("creditBalanceInr", newBalance.toPlainString(), "deductedInr", amountInr.toPlainString()),
                tenantId.toString(), "HUB", "SUCCESS", reason.trim(),
                adjustment.getId(), idempotencyKey.trim());
        return result;
    }

    private TenantResponse replayCreditAdjustment(Tenant tenant, String operation,
                                                  String idempotencyKey, String fingerprint) {
        if (idempotencyKey == null || idempotencyKey.isBlank()) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                    "An idempotency key is required for credit adjustments");
        }
        return creditAdjustmentRepository.findByIdempotencyKey(idempotencyKey.trim())
                .map(existing -> {
                    if (!tenant.getId().toString().equals(existing.getTenantId())
                            || !operation.equals(existing.getOperation())
                            || !fingerprint.equals(existing.getRequestFingerprint())) {
                        throw new BusinessException(ErrorCode.CONCURRENT_MODIFICATION,
                                "Idempotency key was already used for a different credit adjustment",
                                HttpStatus.CONFLICT);
                    }
                    TenantResponse response = toResponse(tenant);
                    response.setCreditBalanceInr(existing.getBalanceAfterInr());
                    return response;
                }).orElse(null);
    }

    private TenantCreditAdjustment saveCreditAdjustment(Tenant tenant, String operation,
                                                         java.math.BigDecimal amountInr,
                                                         String reason, String idempotencyKey,
                                                         String fingerprint,
                                                         java.math.BigDecimal before,
                                                         java.math.BigDecimal after,
                                                         String actorId) {
        return creditAdjustmentRepository.save(TenantCreditAdjustment.builder()
                .id(UUID.randomUUID().toString()).tenantId(tenant.getId().toString())
                .operation(operation).amountInr(amountInr).reason(reason.trim())
                .idempotencyKey(idempotencyKey.trim()).requestFingerprint(fingerprint)
                .balanceBeforeInr(before).balanceAfterInr(after).actorId(actorId).build());
    }

    private static String creditAdjustmentFingerprint(String operation, UUID tenantId,
                                                       java.math.BigDecimal amountInr,
                                                       String reason) {
        String canonical = String.join("\u001f", operation, tenantId.toString(),
                amountInr.stripTrailingZeros().toPlainString(), reason.trim());
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(canonical.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception exception) {
            throw new IllegalStateException("Could not fingerprint credit adjustment", exception);
        }
    }

    private static void validateCreditAdjustment(java.math.BigDecimal amountInr, String reason) {
        if (amountInr == null || amountInr.compareTo(java.math.BigDecimal.ZERO) <= 0
                || amountInr.scale() > 2) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                    "Credit amount must be positive with at most two decimal places");
        }
        if (reason == null || reason.isBlank()) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                    "A reason is required for every credit adjustment");
        }
    }

    public TenantResponse cancelMembership(UUID tenantId, String requestedByUserId, String actorRole) {
        Tenant t = tenantRepository.findById(tenantId)
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND, "Tenant not found"));
        t.setCancellationRequestedAt(java.time.LocalDateTime.now());
        t.setCancellationRequestedBy(requestedByUserId);
        TenantResponse response = toResponse(tenantRepository.save(t));
        auditClient.log("TENANT", tenantId.toString(),
                "CANCELLATION_REQUESTED", requestedByUserId, actorRole,
                null, java.util.Map.of("cancellationRequested", true), tenantId.toString());
        return response;
    }

    public TenantResponse resumeMembership(UUID tenantId, String actorId, String actorRole) {
        Tenant t = tenantRepository.findById(tenantId)
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND, "Tenant not found"));
        t.setCancellationRequestedAt(null);
        t.setCancellationRequestedBy(null);
        TenantResponse response = toResponse(tenantRepository.save(t));
        auditClient.log("TENANT", tenantId.toString(),
                "CANCELLATION_REVOKED", actorId, actorRole,
                java.util.Map.of("cancellationRequested", true),
                java.util.Map.of("cancellationRequested", false), tenantId.toString());
        return response;
    }

    // ── Private helpers ──────────────────────────────────────────────────────

    private TenantResponse toResponse(Tenant t) {
        long memberCount = memberLinkRepository.countByTenantId(t.getId());
        return TenantResponse.builder()
                .id(t.getId().toString())
                .name(t.getName())
                .slug(t.getSlug())
                .status(t.getStatus())
                .plan(t.getPlan())
                .planExpiresAt(t.getPlanExpiresAt())
                .requestedPlan(t.getRequestedPlan())
                .upgradeRequestedAt(t.getUpgradeRequestedAt())
                .renewalRequestedAt(t.getRenewalRequestedAt())
                .contactPhone(t.getContactPhone())
                .contactEmail(t.getContactEmail())
                .memberCount(memberCount)
                .createdAt(t.getCreatedAt())
                .referralCode(t.getReferralCode())
                .creditBalanceInr(t.getCreditBalanceInr())
                .promoDiscountUntil(t.getPromoDiscountUntil())
                .cancellationRequestedAt(t.getCancellationRequestedAt())
                .cancellationRequestedBy(t.getCancellationRequestedBy())
                .supportPhoneNumber(t.getSupportPhoneNumber())
                .businessRegNumber(t.getBusinessRegNumber())
                .build();
    }

    private String generateTempPassword() {
        String chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
        StringBuilder sb = new StringBuilder(10);
        java.security.SecureRandom rng = new java.security.SecureRandom();
        for (int i = 0; i < 10; i++) sb.append(chars.charAt(rng.nextInt(chars.length())));
        return sb.toString();
    }

    private static java.util.Map<String, Object> tenantAuditSnapshot(Tenant tenant) {
        java.util.Map<String, Object> snapshot = new java.util.LinkedHashMap<>();
        snapshot.put("name", tenant.getName());
        snapshot.put("slug", tenant.getSlug());
        snapshot.put("businessRegNumber", tenant.getBusinessRegNumber());
        snapshot.put("supportPhoneNumber", tenant.getSupportPhoneNumber());
        return snapshot;
    }

    // ── Org settings (admin self-service) ────────────────────────────────────

    @Transactional(readOnly = true)
    public java.util.Map<String, Object> getOrgSettings(String tenantId) {
        return tenantRepository.findById(UUID.fromString(tenantId))
                .map(t -> {
                    java.util.Map<String, Object> m = new java.util.LinkedHashMap<>();
                    m.put("name", t.getName());
                    m.put("slug", t.getSlug());
                    m.put("businessRegNumber", t.getBusinessRegNumber());
                    m.put("supportPhoneNumber", t.getSupportPhoneNumber());
                    return m;
                })
                .orElse(null);
    }

    // ── Support phone number ──────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public java.util.Map<String, String> getSupportContact(String tenantId) {
        return tenantRepository.findById(UUID.fromString(tenantId))
                .map(Tenant::getSupportPhoneNumber)
                .filter(p -> p != null && !p.isBlank())
                .map(p -> java.util.Map.of("supportPhoneNumber", p))
                .orElse(null);
    }

    public void saveSupportPhoneNumber(String tenantId, String phone, String countryCode) {
        Tenant tenant = tenantRepository.findById(UUID.fromString(tenantId))
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND, "Tenant not found"));
        String cc = (countryCode != null && !countryCode.isBlank()) ? countryCode : "+91";
        String digits = phone.replaceAll("[^0-9]", "");
        tenant.setSupportPhoneNumber(cc + digits);
        tenantRepository.save(tenant);
    }

    private void sendStatusEmail(Tenant t, String newStatus) {
        if (t.getContactEmail() == null || t.getContactEmail().isBlank()) return;
        try {
            String html, text, subject;
            switch (newStatus) {
                case "ACTIVE" -> {
                    String adminUsername = userRepository.findByTenantIdAndRoleInAndDeletedAtIsNull(
                            t.getId().toString(), List.of(Role.ADMIN))
                            .stream().findFirst().map(User::getUsername).orElse(null);
                    String planCode = t.getPlan() != null ? t.getPlan().toUpperCase() : "BASIC";
                    PlanLimits planLimits = planLimitsRepository.findById(planCode).orElse(null);
                    html = EmailService.buildApprovalEmailHtml(null, t.getName(), t.getSlug(), adminUsername, null, planLimits);
                    text = EmailService.buildApprovalEmailText(null, t.getName(), t.getSlug(), adminUsername, null, planLimits);
                    subject = "Your ChitWise account is now active — " + t.getName();
                }
                case "REJECTED" -> {
                    html = EmailService.buildRejectionEmailHtml(null, t.getName());
                    text = EmailService.buildRejectionEmailText(null, t.getName());
                    subject = "Update on your ChitWise registration — " + t.getName();
                }
                case "SUSPENDED" -> {
                    html = EmailService.buildSuspensionEmailHtml(null, t.getName());
                    text = EmailService.buildSuspensionEmailText(null, t.getName());
                    subject = "Your ChitWise account has been suspended — " + t.getName();
                }
                default -> { return; }
            }
            notificationEventPublisher.publishEmail(t.getContactEmail(), subject, html, text);
        } catch (Exception e) {
            log.warn("Status-change email ({}) could not be queued for tenant {}: {}", newStatus, t.getId(), e.getMessage());
        }
    }

    private String generateUsername(String email, String slug) {
        // email prefix + slug suffix, sanitized
        String prefix = email.split("@")[0].replaceAll("[^a-zA-Z0-9]", "").toLowerCase();
        String base = prefix + "_" + slug;
        if (base.length() > 45) base = base.substring(0, 45);
        // Ensure uniqueness
        String candidate = base;
        int suffix = 1;
        while (userRepository.existsByUsername(candidate)) {
            candidate = base + suffix++;
        }
        return candidate;
    }
}
