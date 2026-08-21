package com.chitfund.userservice.service;

import com.chitfund.common.exception.BusinessException;
import com.chitfund.common.exception.ErrorCode;
import com.chitfund.userservice.client.AuditClient;
import com.chitfund.userservice.client.NotificationServiceClient;
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
import com.chitfund.userservice.dto.request.SetCustomLimitsRequest;
import com.chitfund.userservice.dto.response.EffectiveLimitsResponse;
import com.chitfund.userservice.dto.response.BillingInfoResponse;
import com.chitfund.userservice.repository.PromotionRepository;
import com.chitfund.userservice.repository.TenantCustomLimitsRepository;
import com.chitfund.userservice.repository.TenantRepository;
import com.chitfund.userservice.repository.UserRepository;
import com.chitfund.userservice.repository.MemberUserLinkRepository;
import com.chitfund.userservice.repository.PlanLimitsRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.chitfund.userservice.util.CapabilityJson;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Transactional
public class TenantService {

    private final TenantRepository tenantRepository;
    private final UserRepository userRepository;
    private final MemberUserLinkRepository memberLinkRepository;
    private final TenantCustomLimitsRepository customLimitsRepository;
    private final PlanLimitsRepository planLimitsRepository;
    private final PromotionRepository promotionRepository;
    private final PasswordEncoder passwordEncoder;
    private final PromotionService promotionService;
    private final NotificationServiceClient notificationServiceClient;
    private final AuditClient auditClient;
    private final com.fasterxml.jackson.databind.ObjectMapper objectMapper;

    // ── Public org self-registration ─────────────────────────────────────────

    public TenantResponse registerOrg(RegisterOrgRequest req) {
        if (tenantRepository.existsBySlugAndStatusNot(req.getSlug(), "REJECTED")) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                    "Subdomain '" + req.getSlug() + "' is already taken", HttpStatus.CONFLICT);
        }
        if (userRepository.existsByEmail(req.getAdminEmail())) {
            throw new BusinessException(ErrorCode.EMAIL_TAKEN,
                    "An account with this email already exists");
        }

        String plan = (req.getPlan() != null && !req.getPlan().isBlank()) ? req.getPlan().toUpperCase() : "BASIC";

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
                .tempPassword(rawPassword)
                .mustChangePassword(false)
                .role(Role.ADMIN)
                .tenantId(tenant.getId().toString())
                .termsAcceptedAt(java.time.LocalDateTime.now())
                .termsVersion("1.0")
                .build();
        userRepository.save(admin);

        return toResponse(tenant);
    }

    // ── Tenant info helpers used by AuthService ──────────────────────────────

    public List<TenantInfo> buildTenantInfoList(UUID userId) {
        User user = userRepository.findById(userId).orElse(null);
        if (user == null) return List.of();

        // MEMBER role — get memberId from member_user_links
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

    public ActivationResponse activateTenant(UUID tenantId) {
        Tenant t = tenantRepository.findById(tenantId)
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND, "Tenant not found"));
        String prevStatus = t.getStatus();
        t.setStatus("ACTIVE");
        tenantRepository.save(t);

        // Ensure a limits row exists (seed from plan if not already set)
        if (!customLimitsRepository.existsById(tenantId.toString())) {
            String planCode = t.getPlan() != null ? t.getPlan().toUpperCase() : "BASIC";
            planLimitsRepository.findById(planCode).ifPresent(p -> seedLimitsFromPlan(tenantId.toString(), p));
        }

        promotionService.onTenantActivated(tenantId);
        auditClient.log("TENANT", tenantId.toString(),
                "TENANT_ACTIVATED", null, "ROLE_SUPER_ADMIN",
                java.util.Map.of("status", prevStatus != null ? prevStatus : "PENDING"),
                java.util.Map.of("status", "ACTIVE", "plan", t.getPlan() != null ? t.getPlan() : "BASIC"),
                tenantId.toString());

        // Check if an ADMIN user already exists for this org
        List<User> admins = userRepository.findByTenantIdAndRoleInAndDeletedAtIsNull(
                tenantId.toString(), List.of(Role.ADMIN));

        if (!admins.isEmpty()) {
            User existingAdmin = admins.get(0);
            return ActivationResponse.builder()
                    .tenant(toResponse(t))
                    .adminUsername(existingAdmin.getUsername())
                    .adminTempPassword(existingAdmin.getTempPassword())
                    .adminUserId(existingAdmin.getId().toString())
                    .adminAlreadyExisted(true)
                    .build();
        }

        // Auto-create admin account
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
                .tempPassword(rawPassword)
                .mustChangePassword(true)
                .role(Role.ADMIN)
                .build();
        userRepository.save(admin);

        return ActivationResponse.builder()
                .tenant(toResponse(t))
                .adminUsername(username)
                .adminTempPassword(rawPassword)
                .adminUserId(admin.getId().toString())
                .adminAlreadyExisted(false)
                .build();
    }

    public TenantResponse suspendTenant(UUID tenantId) {
        Tenant t = tenantRepository.findById(tenantId)
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND, "Tenant not found"));
        t.setStatus("SUSPENDED");
        tenantRepository.save(t);
        return toResponse(t);
    }

    public boolean slugExists(String slug) {
        return tenantRepository.existsBySlugAndStatusNot(slug, "REJECTED");
    }

    public TenantResponse setTenantStatus(UUID tenantId, String newStatus) {
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
                "STATUS_CHANGED", null, "ROLE_SUPER_ADMIN",
                java.util.Map.of("status", prevStatus != null ? prevStatus : "UNKNOWN"),
                java.util.Map.of("status", upper),
                tenantId.toString());
        return toResponse(t);
    }

    public TenantResponse reactivateTenant(UUID tenantId, String newSlug) {
        Tenant t = tenantRepository.findById(tenantId)
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND, "Tenant not found"));
        if (!"REJECTED".equals(t.getStatus())) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED, "Only rejected tenants can be reactivated");
        }
        String targetSlug = (newSlug != null && !newSlug.isBlank()) ? newSlug.toLowerCase().trim() : t.getSlug();
        // Check slug availability (excluding this tenant itself and other REJECTED tenants)
        boolean slugTaken = tenantRepository.existsBySlugAndStatusNot(targetSlug, "REJECTED")
                || tenantRepository.findAllByStatusOrderByCreatedAtDesc("REJECTED").stream()
                   .anyMatch(other -> !other.getId().equals(tenantId) && targetSlug.equals(other.getSlug()));
        if (slugTaken) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                    "Subdomain '" + targetSlug + "' is already taken — please choose another", HttpStatus.CONFLICT);
        }
        t.setSlug(targetSlug);
        t.setStatus("PENDING");
        tenantRepository.save(t);
        return toResponse(t);
    }

    public TenantResponse updatePlan(UUID tenantId, String plan) {
        Tenant t = tenantRepository.findById(tenantId)
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND, "Tenant not found"));
        String prevPlan = t.getPlan();
        t.setPlan(plan.toUpperCase());
        t.setRequestedPlan(null);
        t.setUpgradeRequestedAt(null);
        tenantRepository.save(t);
        auditClient.log("TENANT", tenantId.toString(),
                "PLAN_CHANGED", null, "ROLE_SUPER_ADMIN",
                java.util.Map.of("plan", prevPlan != null ? prevPlan : "BASIC"),
                java.util.Map.of("plan", plan.toUpperCase()),
                tenantId.toString());
        return toResponse(t);
    }

    @Transactional
    public void requestPlanUpgrade(String tenantId, String toPlan) {
        Tenant t = tenantRepository.findById(UUID.fromString(tenantId))
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND, "Tenant not found"));
        t.setRequestedPlan(toPlan.toUpperCase());
        t.setUpgradeRequestedAt(java.time.LocalDateTime.now());
        tenantRepository.save(t);
    }

    public List<TenantResponse> listPendingUpgradeRequests() {
        return tenantRepository.findAllByRequestedPlanIsNotNullOrderByUpgradeRequestedAtAsc()
                .stream().map(this::toResponse).toList();
    }

    public List<TenantResponse> listPendingRenewalRequests() {
        return tenantRepository.findAllByRenewalRequestedAtIsNotNullOrderByRenewalRequestedAtAsc()
                .stream().map(this::toResponse).toList();
    }

    public void clearRenewalRequest(UUID tenantId) {
        tenantRepository.findById(tenantId).ifPresent(t -> {
            t.setRenewalRequestedAt(null);
            tenantRepository.save(t);
        });
        auditClient.log("TENANT", tenantId.toString(),
                "RENEWAL_APPROVED", null, "ROLE_SUPER_ADMIN",
                null, null, tenantId.toString());
    }

    public void requestRenewal(String tenantId) {
        Tenant t = tenantRepository.findById(UUID.fromString(tenantId))
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND, "Tenant not found"));
        t.setRenewalRequestedAt(java.time.LocalDateTime.now());
        tenantRepository.save(t);
        auditClient.log("TENANT", tenantId,
                "RENEWAL_REQUESTED", null, "ROLE_ADMIN",
                null, java.util.Map.of("plan", t.getPlan() != null ? t.getPlan() : "BASIC"),
                tenantId);

        // Notify all super-admin accounts
        userRepository.findByRoleIn(java.util.List.of(com.chitfund.userservice.domain.enums.Role.SUPER_ADMIN))
                .forEach(admin -> notificationServiceClient.createInApp(
                        admin.getId(),
                        "Renewal Request",
                        t.getName() + " (" + t.getPlan() + " plan) has requested a renewal.",
                        "RENEWAL_REQUEST",
                        "/superadmin/tenants/" + tenantId));
    }

    public TenantResponse setPlanExpiry(UUID tenantId, java.time.LocalDateTime expiresAt) {
        Tenant t = tenantRepository.findById(tenantId)
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND, "Tenant not found"));
        java.time.LocalDateTime prev = t.getPlanExpiresAt();
        t.setPlanExpiresAt(expiresAt);
        t.setRenewalRequestedAt(null); // clear renewal request when expiry is updated
        tenantRepository.save(t);
        auditClient.log("TENANT", tenantId.toString(),
                "PLAN_EXPIRY_SET", null, "ROLE_SUPER_ADMIN",
                java.util.Map.of("planExpiresAt", prev != null ? prev.toString() : "none"),
                java.util.Map.of("planExpiresAt", expiresAt != null ? expiresAt.toString() : "none"),
                tenantId.toString());
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

    public TenantResponse updateTenant(UUID tenantId, UpdateTenantRequest req) {
        Tenant t = tenantRepository.findById(tenantId)
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND, "Tenant not found"));
        t.setName(req.getName().trim());
        if (req.getSlug() != null && !req.getSlug().isBlank()) {
            String newSlug = req.getSlug().toLowerCase().trim();
            if (!newSlug.equals(t.getSlug()) && tenantRepository.existsBySlug(newSlug)) {
                throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                        "Subdomain '" + newSlug + "' is already taken", HttpStatus.CONFLICT);
            }
            t.setSlug(newSlug);
        }
        tenantRepository.save(t);
        return toResponse(t);
    }

    public OrgUserResponse addOrgUser(UUID tenantId, AddOrgUserRequest req) {
        tenantRepository.findById(tenantId)
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND, "Tenant not found"));
        Role role = Role.valueOf(req.getRole().toUpperCase());

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
                .role(role)
                .tenantId(tenantId.toString())
                .build();
        userRepository.save(user);

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
                .tempPassword(admin.getTempPassword())
                .build();
    }

    // ── Custom plan limits ───────────────────────────────────────────────────

    public EffectiveLimitsResponse setCustomLimits(UUID tenantId, SetCustomLimitsRequest req) {
        Tenant t = tenantRepository.findById(tenantId)
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND, "Tenant not found"));

        TenantCustomLimits limits = customLimitsRepository.findById(tenantId.toString())
                .orElse(TenantCustomLimits.builder().tenantId(tenantId.toString()).build());
        limits.setMaxActiveChits(req.getMaxActiveChits());
        limits.setMaxMembers(req.getMaxMembers());
        limits.setMaxStaff(req.getMaxStaff());
        limits.setAllowedChitTypes(req.getAllowedChitTypes().toUpperCase());
        limits.setPriceMonthlyInr(req.getPriceMonthlyInr());
        limits.setPlanCode("CUSTOM");
        limits.setNotes(req.getNotes());
        if (req.getEnabledCapabilities() != null) {
            try { limits.setCapabilities(objectMapper.writeValueAsString(req.getEnabledCapabilities())); }
            catch (Exception ignored) {}
        }
        customLimitsRepository.save(limits);

        // Automatically set plan to CUSTOM
        String prevPlan = t.getPlan();
        t.setPlan("CUSTOM");
        t.setRequestedPlan(null);
        t.setUpgradeRequestedAt(null);
        tenantRepository.save(t);

        auditClient.log("TENANT", tenantId.toString(),
                "CUSTOM_LIMITS_SET", null, "ROLE_SUPER_ADMIN",
                java.util.Map.of("plan", prevPlan != null ? prevPlan : "BASIC"),
                java.util.Map.of("plan", "CUSTOM",
                        "maxActiveChits", String.valueOf(req.getMaxActiveChits()),
                        "maxMembers", String.valueOf(req.getMaxMembers()),
                        "maxStaff", String.valueOf(req.getMaxStaff())),
                tenantId.toString());

        return toEffectiveLimits(limits, t.getPlanExpiresAt(), CapabilityJson.parse(limits.getCapabilities(), objectMapper));
    }

    public void removeCustomLimits(UUID tenantId, String fallbackPlan) {
        String planCode = fallbackPlan != null ? fallbackPlan.toUpperCase() : "BASIC";
        PlanLimits plan = planLimitsRepository.findById(planCode)
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND, "Plan not found: " + planCode));
        // Reset limits row to plan defaults (never delete — always keep a row)
        seedLimitsFromPlan(tenantId.toString(), plan);

        Tenant t = tenantRepository.findById(tenantId)
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND, "Tenant not found"));
        String prevPlan = t.getPlan();
        t.setPlan(planCode);
        tenantRepository.save(t);
        auditClient.log("TENANT", tenantId.toString(),
                "CUSTOM_LIMITS_REMOVED", null, "ROLE_SUPER_ADMIN",
                java.util.Map.of("plan", prevPlan != null ? prevPlan : "CUSTOM"),
                java.util.Map.of("plan", planCode),
                tenantId.toString());
    }

    @Transactional(readOnly = true)
    public EffectiveLimitsResponse getEffectiveLimits(String tenantId) {
        TenantCustomLimits limits = customLimitsRepository.findById(tenantId)
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND, "Tenant not found"));
        Tenant tenant = tenantRepository.findById(java.util.UUID.fromString(tenantId)).orElse(null);
        java.time.LocalDateTime expiresAt = tenant != null ? tenant.getPlanExpiresAt() : null;
        java.util.List<String> caps = resolveCaps(limits);
        return toEffectiveLimits(limits, expiresAt, caps);
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

    private EffectiveLimitsResponse toEffectiveLimits(TenantCustomLimits c, java.time.LocalDateTime planExpiresAt,
                                                      java.util.List<String> caps) {
        return EffectiveLimitsResponse.builder()
                .plan(c.getPlanCode())
                .isCustom("CUSTOM".equals(c.getPlanCode()))
                .maxActiveChits(c.getMaxActiveChits())
                .maxMembers(c.getMaxMembers())
                .maxStaff(c.getMaxStaff())
                .enabledCapabilities(caps)
                .analyticsEnabled(caps.contains("full_analytics"))
                .prioritySupport(caps.contains("priority_support"))
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
        String planCode = t.getPlan() != null ? t.getPlan().toUpperCase() : "BASIC";
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

    public void addUserToTenant(UUID userId, UUID tenantId, Role role, UUID memberId) {
        if (role != Role.MEMBER) return; // only members need a link row
        if (memberLinkRepository.existsByUserId(userId)) return;
        MemberUserLink link = MemberUserLink.builder()
                .userId(userId)
                .tenantId(tenantId)
                .memberId(memberId)
                .build();
        memberLinkRepository.save(link);
    }

    public void updateMemberId(UUID userId, UUID tenantId, UUID memberId) {
        memberLinkRepository.findByUserIdAndTenantId(userId, tenantId)
                .ifPresent(link -> {
                    link.setMemberId(memberId);
                    memberLinkRepository.save(link);
                });
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
                .build();
    }

    // ── Super-admin: manually add credit to a tenant ─────────────────────────

    @Transactional
    public TenantResponse addCredit(UUID tenantId, java.math.BigDecimal amountInr) {
        Tenant t = tenantRepository.findById(tenantId)
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND, "Tenant not found"));
        if (amountInr.compareTo(java.math.BigDecimal.ZERO) <= 0) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED, "Credit amount must be positive");
        }
        java.math.BigDecimal current = t.getCreditBalanceInr() != null ? t.getCreditBalanceInr() : java.math.BigDecimal.ZERO;
        java.math.BigDecimal newBalance = current.add(amountInr);
        t.setCreditBalanceInr(newBalance);
        TenantResponse result = toResponse(tenantRepository.save(t));
        auditClient.log("TENANT", tenantId.toString(),
                "CREDIT_ADDED", null, "ROLE_SUPER_ADMIN",
                java.util.Map.of("creditBalanceInr", current.toPlainString()),
                java.util.Map.of("creditBalanceInr", newBalance.toPlainString(), "addedInr", amountInr.toPlainString()),
                tenantId.toString());
        return result;
    }

    @Transactional
    public TenantResponse deductCredit(UUID tenantId, java.math.BigDecimal amountInr) {
        Tenant t = tenantRepository.findById(tenantId)
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND, "Tenant not found"));
        if (amountInr.compareTo(java.math.BigDecimal.ZERO) <= 0) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED, "Deduction amount must be positive");
        }
        java.math.BigDecimal current = t.getCreditBalanceInr() != null ? t.getCreditBalanceInr() : java.math.BigDecimal.ZERO;
        java.math.BigDecimal newBalance = current.subtract(amountInr).max(java.math.BigDecimal.ZERO);
        t.setCreditBalanceInr(newBalance);
        TenantResponse result = toResponse(tenantRepository.save(t));
        auditClient.log("TENANT", tenantId.toString(),
                "CREDIT_DEDUCTED", null, "ROLE_SUPER_ADMIN",
                java.util.Map.of("creditBalanceInr", current.toPlainString()),
                java.util.Map.of("creditBalanceInr", newBalance.toPlainString(), "deductedInr", amountInr.toPlainString()),
                tenantId.toString());
        return result;
    }

    public TenantResponse cancelMembership(UUID tenantId, String requestedByUserId) {
        Tenant t = tenantRepository.findById(tenantId)
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND, "Tenant not found"));
        t.setCancellationRequestedAt(java.time.LocalDateTime.now());
        t.setCancellationRequestedBy(requestedByUserId);
        return toResponse(tenantRepository.save(t));
    }

    public TenantResponse resumeMembership(UUID tenantId) {
        Tenant t = tenantRepository.findById(tenantId)
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND, "Tenant not found"));
        t.setCancellationRequestedAt(null);
        t.setCancellationRequestedBy(null);
        return toResponse(tenantRepository.save(t));
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
                .build();
    }

    private String generateTempPassword() {
        String chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
        StringBuilder sb = new StringBuilder(10);
        java.util.Random rng = new java.util.Random();
        for (int i = 0; i < 10; i++) sb.append(chars.charAt(rng.nextInt(chars.length())));
        return sb.toString();
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
