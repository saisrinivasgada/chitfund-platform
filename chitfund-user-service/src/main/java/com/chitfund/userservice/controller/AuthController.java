package com.chitfund.userservice.controller;

import com.chitfund.common.dto.ApiResponse;
import com.chitfund.common.exception.BusinessException;
import com.chitfund.common.exception.ErrorCode;
import com.chitfund.userservice.domain.entity.User;
import com.chitfund.userservice.domain.enums.Role;
import com.chitfund.userservice.dto.request.*;
import com.chitfund.userservice.dto.response.*;
import com.chitfund.userservice.service.AuthService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {

    private final AuthService authService;

    // ── Public: org self-registration ────────────────────────────────────────

    @GetMapping("/check-slug")
    public ResponseEntity<ApiResponse<java.util.Map<String, Object>>> checkSlug(
            @RequestParam String slug) {
        boolean available = !authService.slugExists(slug);
        return ResponseEntity.ok(ApiResponse.success(
                java.util.Map.of("slug", slug, "available", available), "ok"));
    }

    @PostMapping("/register-org")
    public ResponseEntity<ApiResponse<TenantResponse>> registerOrg(
            @Valid @RequestBody RegisterOrgRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success(authService.registerOrg(request), "Organization registered — pending activation"));
    }

    // ── Public: staff account creation (admin-only in practice via role check) ──

    @PostMapping("/register")
    public ResponseEntity<ApiResponse<AuthResponse>> register(@Valid @RequestBody RegisterRequest request) {
        Role role = request.getRole();
        if (role != null && role != Role.MEMBER) {
            throw new BusinessException(ErrorCode.FORBIDDEN,
                    "Staff accounts must be created by an admin via /api/users/staff");
        }
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success(authService.register(request, null), "Registration successful"));
    }

    // ── Step 1: login → pre-scope token + tenant list ────────────────────────

    @PostMapping("/login")
    public ResponseEntity<ApiResponse<LoginResponse>> login(@Valid @RequestBody LoginRequest request) {
        return ResponseEntity.ok(ApiResponse.success(authService.login(request), "Login successful"));
    }

    // ── Step 2: select tenant → scoped access token ──────────────────────────

    @PostMapping("/select-tenant")
    public ResponseEntity<ApiResponse<AuthResponse>> selectTenant(
            @Valid @RequestBody SelectTenantRequest request) {
        return ResponseEntity.ok(ApiResponse.success(
                authService.selectTenant(request), "Tenant selected"));
    }

    // ── Account setup (member clicks SMS link) ───────────────────────────────

    @PostMapping("/setup-account")
    public ResponseEntity<ApiResponse<AuthResponse>> setupAccount(
            @Valid @RequestBody SetupAccountRequest request) {
        return ResponseEntity.ok(ApiResponse.success(
                authService.setupAccount(request), "Account activated"));
    }

    // ── Transfer token: generate pre-scope JWT for cross-subdomain switch ────
    // Caller must be authenticated with a valid scoped token

    @PostMapping("/transfer-token")
    public ResponseEntity<ApiResponse<PreScopeAuthResponse>> generateTransferToken(
            @AuthenticationPrincipal User user) {
        if (user == null) {
            throw new BusinessException(ErrorCode.UNAUTHORIZED);
        }
        return ResponseEntity.ok(ApiResponse.success(
                authService.generateTransferToken(user.getId()), "Transfer token ready"));
    }

    // ── Token refresh ────────────────────────────────────────────────────────

    @PostMapping("/refresh")
    public ResponseEntity<ApiResponse<AuthResponse>> refresh(@Valid @RequestBody RefreshTokenRequest request) {
        return ResponseEntity.ok(ApiResponse.success(authService.refresh(request)));
    }

    @PostMapping("/logout")
    public ResponseEntity<ApiResponse<Void>> logout(@Valid @RequestBody RefreshTokenRequest request) {
        authService.logout(request.getRefreshToken());
        return ResponseEntity.ok(ApiResponse.success(null, "Logged out successfully"));
    }

    // ── Self-service password reset via mobile OTP ───────────────────────────

    @PostMapping("/forgot-password/send")
    public ResponseEntity<ApiResponse<Void>> sendForgotPasswordOtp(
            @Valid @RequestBody SendPhoneOtpRequest req) {
        authService.sendForgotPasswordOtp(req.getPhone(), req.getCountryCode());
        return ResponseEntity.ok(ApiResponse.success(null, "If an account exists for this number, an OTP has been sent"));
    }

    @PostMapping("/forgot-password/reset")
    public ResponseEntity<ApiResponse<Void>> resetPasswordViaOtp(
            @Valid @RequestBody ForgotPasswordResetRequest req) {
        authService.resetPasswordViaOtp(req);
        return ResponseEntity.ok(ApiResponse.success(null, "Password reset successfully. Please sign in with your new password."));
    }

    // ── Mobile login (2-step) ────────────────────────────────────────────────

    @PostMapping("/mobile-lookup")
    public ResponseEntity<ApiResponse<MobileLookupResponse>> mobileLookup(
            @RequestParam String phone,
            @RequestParam String phoneCountryCode) {
        return ResponseEntity.ok(ApiResponse.success(authService.lookupByMobile(phone, phoneCountryCode)));
    }

    @PostMapping("/login-mobile")
    public ResponseEntity<ApiResponse<LoginResponse>> loginByMobile(
            @Valid @RequestBody MobileLoginRequest request) {
        return ResponseEntity.ok(ApiResponse.success(authService.loginByMobile(request), "Login successful"));
    }
}
