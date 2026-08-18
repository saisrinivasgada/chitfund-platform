package com.chitfund.userservice.controller;

import com.chitfund.common.dto.ApiResponse;
import com.chitfund.common.exception.BusinessException;
import com.chitfund.common.exception.ErrorCode;
import com.chitfund.userservice.domain.entity.User;
import com.chitfund.userservice.domain.enums.Role;
import com.chitfund.userservice.dto.request.ChangePasswordRequest;
import com.chitfund.userservice.dto.request.CreateMemberLoginRequest;
import com.chitfund.userservice.dto.request.RegisterRequest;
import com.chitfund.userservice.dto.request.SendPhoneOtpRequest;
import com.chitfund.userservice.dto.request.UpdateUserProfileRequest;
import com.chitfund.userservice.dto.request.VerifyPhoneOtpRequest;
import com.chitfund.userservice.service.OtpService;
import com.chitfund.userservice.service.RateLimiterService;
import jakarta.servlet.http.HttpServletRequest;
import com.chitfund.userservice.dto.response.AuthResponse;
import com.chitfund.userservice.dto.response.CreateMemberLoginResponse;
import com.chitfund.userservice.dto.response.ResetPasswordResponse;
import com.chitfund.userservice.dto.response.BillingInfoResponse;
import com.chitfund.userservice.dto.response.UserResponse;
import com.chitfund.userservice.dto.response.EffectiveLimitsResponse;
import com.chitfund.common.context.TenantContext;
import com.chitfund.userservice.service.AuthService;
import com.chitfund.userservice.service.PlanService;
import com.chitfund.userservice.service.PromotionService;
import com.chitfund.userservice.service.TenantService;
import com.chitfund.userservice.service.UserService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * WHY @PreAuthorize instead of .requestMatchers() in SecurityConfig?
 * - SecurityConfig is good for coarse-grained rules (all of /api/users/** needs auth)
 * - @PreAuthorize is better for method-level rules (this specific method needs ADMIN)
 * - Mixing both is normal: SecurityConfig as the gate, @PreAuthorize as the lock
 * - SpEL expressions: hasRole('ADMIN'), hasAnyRole('ADMIN','MANAGER'),
 *   #userId == authentication.principal.id (ownership checks)
 */
@RestController
@RequestMapping("/api/users")
@RequiredArgsConstructor
public class UserController {

    private final UserService userService;
    private final AuthService authService;
    private final OtpService otpService;
    private final RateLimiterService rateLimiterService;
    private final PlanService planService;
    private final TenantService tenantService;
    private final PromotionService promotionService;

    // Any authenticated user can fetch their own profile
    @GetMapping("/me")
    public ResponseEntity<ApiResponse<UserResponse>> getCurrentUser(Authentication authentication) {
        return ResponseEntity.ok(ApiResponse.success(
                userService.getCurrentUser(authentication.getName())));
    }

    @GetMapping("/me/billing-info")
    public ResponseEntity<ApiResponse<BillingInfoResponse>> getMyBillingInfo() {
        String tenantId = TenantContext.get();
        if (tenantId == null) return ResponseEntity.ok(ApiResponse.success(null));
        return ResponseEntity.ok(ApiResponse.success(
                tenantService.getBillingInfo(java.util.UUID.fromString(tenantId))));
    }

    @GetMapping("/me/effective-limits")
    public ResponseEntity<ApiResponse<EffectiveLimitsResponse>> getMyEffectiveLimits() {
        String tenantId = TenantContext.get();
        if (tenantId == null) return ResponseEntity.ok(ApiResponse.success(null));
        return ResponseEntity.ok(ApiResponse.success(
                tenantService.getEffectiveLimits(tenantId)));
    }

    @GetMapping("/me/referral")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getMyReferralInfo() {
        String tenantId = TenantContext.get();
        if (tenantId == null) {
            return ResponseEntity.ok(ApiResponse.success(Map.of()));
        }
        UUID tid = UUID.fromString(tenantId);
        String code = promotionService.getReferralCode(tid);
        java.math.BigDecimal credit = promotionService.getCreditBalance(tid);
        return ResponseEntity.ok(ApiResponse.success(Map.of(
                "referralCode", code != null ? code : "",
                "creditBalanceInr", credit
        )));
    }

    // Returns effective plan limits for the current user's tenant (for frontend gating)
    @GetMapping("/me/tenant-limits")
    public ResponseEntity<ApiResponse<EffectiveLimitsResponse>> getMyTenantLimits() {
        String tenantId = TenantContext.get();
        if (tenantId == null) {
            return ResponseEntity.ok(ApiResponse.success(
                    EffectiveLimitsResponse.builder().plan("UNLIMITED").maxActiveChits(-1)
                            .maxMembers(-1).maxStaff(-1)
                            .enabledCapabilities(java.util.List.of("full_analytics", "priority_support"))
                            .analyticsEnabled(true).prioritySupport(true).build()));
        }
        return ResponseEntity.ok(ApiResponse.success(tenantService.getEffectiveLimits(tenantId)));
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasAnyAuthority('ADMIN', 'MANAGER')")
    public ResponseEntity<ApiResponse<UserResponse>> getUserById(@PathVariable UUID id) {
        return ResponseEntity.ok(ApiResponse.success(userService.getUserById(id)));
    }

    @PutMapping("/{id}/lock")
    @PreAuthorize("hasAnyAuthority('ADMIN', 'MANAGER')")
    public ResponseEntity<ApiResponse<UserResponse>> lockUser(@PathVariable UUID id, Authentication auth) {
        User caller = (User) auth.getPrincipal();
        return ResponseEntity.ok(ApiResponse.success(userService.lockUser(id, caller), "User account locked"));
    }

    @PutMapping("/{id}/unlock")
    @PreAuthorize("hasAnyAuthority('ADMIN', 'MANAGER')")
    public ResponseEntity<ApiResponse<UserResponse>> unlockUser(@PathVariable UUID id, Authentication auth) {
        User caller = (User) auth.getPrincipal();
        return ResponseEntity.ok(ApiResponse.success(userService.unlockUser(id, caller), "User account unlocked"));
    }

    /**
     * Admin generates a new temp password for a member who forgot theirs.
     * Returns the plaintext password — shown to admin once, never stored again.
     */
    @PostMapping("/{id}/reset-password")
    @PreAuthorize("hasAuthority('ADMIN') or hasAuthority('SUPER_ADMIN')")
    public ResponseEntity<ApiResponse<ResetPasswordResponse>> resetPassword(@PathVariable UUID id) {
        return ResponseEntity.ok(ApiResponse.success(authService.resetPassword(id), "Temporary password generated"));
    }

    /**
     * Member changes their own password. Clears the mustChangePassword flag.
     * Requires the current (temp) password — prevents unauthorized changes.
     */
    @PostMapping("/me/change-password")
    public ResponseEntity<ApiResponse<Void>> changePassword(
            @Valid @RequestBody ChangePasswordRequest request,
            Authentication auth) {
        User user = (User) auth.getPrincipal();
        authService.changePassword(user.getId(), request);
        return ResponseEntity.ok(ApiResponse.success(null, "Password changed successfully"));
    }

    /**
     * Real-time username availability check — used for the Instagram-style indicator
     * while the user types. Excludes the caller's own current username so they can
     * "re-submit" their current name without it flagging as taken.
     */
    @GetMapping("/check-username")
    public ResponseEntity<ApiResponse<Map<String, Boolean>>> checkUsername(
            @RequestParam String username,
            Authentication auth) {
        User currentUser = (User) auth.getPrincipal();
        boolean available = userService.isUsernameAvailable(username, currentUser.getId());
        return ResponseEntity.ok(ApiResponse.success(Map.of("available", available)));
    }

    /**
     * Any authenticated user can update their own username and/or email.
     * The frontend calls this for both admins (MyAccountPage) and members (MemberPortalPage).
     */
    @PatchMapping("/me/profile")
    public ResponseEntity<ApiResponse<UserResponse>> updateMyProfile(
            @Valid @RequestBody UpdateUserProfileRequest request,
            Authentication auth) {
        User user = (User) auth.getPrincipal();
        return ResponseEntity.ok(ApiResponse.success(userService.updateMyProfile(user.getId(), request)));
    }

    // ── Phone OTP — admin sending/verifying for any phone (staff/member creation or update) ──

    @PostMapping("/admin/phone/send-otp")
    @PreAuthorize("hasAnyAuthority('ADMIN', 'MANAGER')")
    public ResponseEntity<ApiResponse<Void>> adminSendPhoneOtp(@Valid @RequestBody SendPhoneOtpRequest req, HttpServletRequest httpRequest) {
        if (!rateLimiterService.tryConsumeForgot(getClientIp(httpRequest))) {
            return ResponseEntity.status(429).body(ApiResponse.error("RATE_LIMIT_001", "Too many requests. Please wait before trying again."));
        }
        otpService.sendOtp(req.getPhone(), req.getCountryCode(), "ADMIN_PHONE_VERIFY", null);
        return ResponseEntity.ok(ApiResponse.success(null, "OTP sent to " + req.getPhone()));
    }

    @PostMapping("/admin/phone/verify-otp")
    @PreAuthorize("hasAnyAuthority('ADMIN', 'MANAGER')")
    public ResponseEntity<ApiResponse<Void>> adminVerifyPhoneOtp(@Valid @RequestBody VerifyPhoneOtpRequest req, HttpServletRequest httpRequest) {
        if (!rateLimiterService.tryConsumeForgot(getClientIp(httpRequest))) {
            return ResponseEntity.status(429).body(ApiResponse.error("RATE_LIMIT_001", "Too many requests. Please wait before trying again."));
        }
        otpService.verifyOtp(req.getPhone(), "ADMIN_PHONE_VERIFY", req.getCode());
        return ResponseEntity.ok(ApiResponse.success(null, "Phone verified"));
    }

    @PatchMapping("/{id}/phone")
    @PreAuthorize("hasAnyAuthority('ADMIN', 'MANAGER')")
    public ResponseEntity<ApiResponse<UserResponse>> adminUpdateUserPhone(
            @PathVariable UUID id,
            @Valid @RequestBody SendPhoneOtpRequest req,
            Authentication auth) {
        User caller = (User) auth.getPrincipal();
        return ResponseEntity.ok(ApiResponse.success(
                userService.adminUpdatePhone(id, caller, req.getPhone(),
                        req.getCountryCode() != null ? req.getCountryCode() : "+91")));
    }

    // ── Phone OTP for authenticated users (phone change) ─────────────────────

    @PostMapping("/me/phone/send-otp")
    public ResponseEntity<ApiResponse<Void>> sendPhoneChangeOtp(
            @Valid @RequestBody SendPhoneOtpRequest req, Authentication auth, HttpServletRequest httpRequest) {
        if (!rateLimiterService.tryConsumeForgot(getClientIp(httpRequest))) {
            return ResponseEntity.status(429).body(ApiResponse.error("RATE_LIMIT_001", "Too many requests. Please wait before trying again."));
        }
        User user = (User) auth.getPrincipal();
        otpService.sendOtp(req.getPhone(), req.getCountryCode(), "PHONE_CHANGE", user.getId().toString());
        return ResponseEntity.ok(ApiResponse.success(null, "OTP sent to " + req.getPhone()));
    }

    @PostMapping("/me/phone/verify-otp")
    public ResponseEntity<ApiResponse<UserResponse>> verifyPhoneChangeOtp(
            @Valid @RequestBody VerifyPhoneOtpRequest req, Authentication auth, HttpServletRequest httpRequest) {
        if (!rateLimiterService.tryConsumeForgot(getClientIp(httpRequest))) {
            return ResponseEntity.status(429).body(ApiResponse.error("RATE_LIMIT_001", "Too many requests. Please wait before trying again."));
        }
        User user = (User) auth.getPrincipal();
        otpService.verifyOtp(req.getPhone(), "PHONE_CHANGE", req.getCode());
        String cc = req.getCountryCode() != null ? req.getCountryCode() : "+91";
        return ResponseEntity.ok(ApiResponse.success(userService.updatePhone(user.getId(), req.getPhone(), cc)));
    }

    // ── Member login / setup-link management ─────────────────────────────────

    /**
     * Admin creates an app login for a member. Idempotent: if the email is already
     * registered as a MEMBER account (partial failure from a previous attempt), the
     * existing user is reused with a fresh temp password — no EMAIL_TAKEN error on retry.
     */
    @PostMapping("/create-member-login")
    @PreAuthorize("hasAuthority('ADMIN')")
    public ResponseEntity<ApiResponse<CreateMemberLoginResponse>> createMemberLogin(
            @Valid @RequestBody CreateMemberLoginRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success(authService.createMemberLogin(request), "Member login created"));
    }

    /**
     * Admin regenerates a setup link for a member who already has a user account.
     * Returns a raw setup token the admin can copy/send to the member.
     * The token is hashed before storage; only this plaintext response contains it.
     */
    @PostMapping("/{userId}/resend-setup-link")
    @PreAuthorize("hasAnyAuthority('ADMIN', 'MANAGER')")
    public ResponseEntity<ApiResponse<Map<String, String>>> resendSetupLink(@PathVariable UUID userId) {
        String token = authService.generateSetupToken(userId);
        return ResponseEntity.ok(ApiResponse.success(
                Map.of("setupToken", token, "userId", userId.toString()),
                "Setup link regenerated"));
    }

    // ── Staff management (ADMIN / MANAGER / WORKER accounts) ─────────────────

    /**
     * Admin lists staff accounts. Pass ?deleted=true to see soft-deleted records.
     */
    @GetMapping("/staff")
    @PreAuthorize("hasAnyAuthority('ADMIN', 'MANAGER')")
    public ResponseEntity<ApiResponse<List<UserResponse>>> listStaff(
            @RequestParam(defaultValue = "false") boolean deleted) {
        return ResponseEntity.ok(ApiResponse.success(userService.listStaff(deleted)));
    }

    /**
     * ADMIN can create ADMIN, MANAGER, or STAFF accounts.
     * MANAGER can only create STAFF accounts.
     */
    @PostMapping("/staff")
    @PreAuthorize("hasAnyAuthority('ADMIN', 'MANAGER')")
    public ResponseEntity<ApiResponse<AuthResponse>> createStaff(
            @Valid @RequestBody RegisterRequest request,
            Authentication authentication) {
        if (request.getRole() == null || request.getRole() == Role.MEMBER) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                    "Role must be ADMIN, MANAGER, or STAFF for staff creation");
        }
        boolean isManager = authentication.getAuthorities().stream()
                .anyMatch(a -> a.getAuthority().equals("MANAGER"));
        if (isManager && request.getRole() != Role.STAFF) {
            throw new BusinessException(ErrorCode.FORBIDDEN,
                    "Managers can only create Staff accounts");
        }
        // Enforce staff limit for non-ADMIN accounts
        if (request.getRole() != Role.ADMIN) {
            String tenantId = TenantContext.get();
            if (tenantId != null) planService.checkStaffLimit(tenantId);
        }
        User actor = (User) authentication.getPrincipal();
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success(authService.register(request, actor.getId()), "Staff account created"));
    }

    /**
     * Admin deactivates a staff account (soft disable — does not delete).
     */
    @PutMapping("/staff/{id}/deactivate")
    @PreAuthorize("hasAuthority('ADMIN')")
    public ResponseEntity<ApiResponse<UserResponse>> deactivateStaff(@PathVariable UUID id) {
        return ResponseEntity.ok(ApiResponse.success(userService.deactivateStaff(id), "Staff account deactivated"));
    }

    /**
     * Admin reactivates a previously deactivated staff account.
     */
    @PutMapping("/staff/{id}/activate")
    @PreAuthorize("hasAuthority('ADMIN')")
    public ResponseEntity<ApiResponse<UserResponse>> activateStaff(@PathVariable UUID id) {
        return ResponseEntity.ok(ApiResponse.success(userService.activateStaff(id), "Staff account activated"));
    }

    /**
     * Admin changes the role of a staff account (ADMIN/MANAGER/WORKER only).
     * Cannot change your own role or a MEMBER's role.
     */
    @PatchMapping("/staff/{id}/role")
    @PreAuthorize("hasAuthority('ADMIN')")
    public ResponseEntity<ApiResponse<UserResponse>> changeRole(
            @PathVariable UUID id,
            @RequestBody Map<String, String> body) {
        String roleStr = body.get("role");
        Role newRole;
        try {
            newRole = Role.valueOf(roleStr);
        } catch (IllegalArgumentException | NullPointerException e) {
            return ResponseEntity.badRequest().body(ApiResponse.error("VALIDATION_001", "Invalid role: " + roleStr));
        }
        return ResponseEntity.ok(ApiResponse.success(userService.changeRole(id, newRole), "Role updated"));
    }

    /**
     * Admin soft-deletes a staff account. Record is kept in DB with deletedAt/deletedBy.
     */
    @DeleteMapping("/staff/{id}")
    @PreAuthorize("hasAuthority('ADMIN')")
    public ResponseEntity<ApiResponse<UserResponse>> deleteStaff(
            @PathVariable UUID id,
            Authentication auth) {
        User admin = (User) auth.getPrincipal();
        return ResponseEntity.ok(ApiResponse.success(
                userService.softDeleteStaff(id, admin.getId()), "Staff account deleted"));
    }

    private String getClientIp(HttpServletRequest request) {
        String realIp = request.getHeader("X-Real-IP");
        if (realIp != null && !realIp.isBlank()) return realIp.trim();
        return request.getRemoteAddr();
    }
}
