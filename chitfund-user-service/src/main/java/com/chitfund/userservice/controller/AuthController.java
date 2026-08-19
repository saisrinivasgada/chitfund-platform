package com.chitfund.userservice.controller;

import com.chitfund.common.dto.ApiResponse;
import com.chitfund.common.exception.BusinessException;
import com.chitfund.common.exception.ErrorCode;
import com.chitfund.userservice.domain.entity.User;
import com.chitfund.userservice.domain.enums.Role;
import com.chitfund.userservice.dto.request.*;
import com.chitfund.userservice.dto.response.*;
import com.chitfund.userservice.service.AuthService;
import com.chitfund.userservice.service.RateLimiterService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.time.Duration;
import java.util.UUID;

@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {

    private final AuthService authService;
    private final RateLimiterService rateLimiter;

    // ── Public: org self-registration ────────────────────────────────────────

    @GetMapping("/check-slug")
    public ResponseEntity<ApiResponse<java.util.Map<String, Object>>> checkSlug(
            @RequestParam String slug) {
        boolean available = !authService.slugExists(slug);
        return ResponseEntity.ok(ApiResponse.success(
                java.util.Map.of("slug", slug, "available", available), "ok"));
    }

    @GetMapping("/check-username")
    public ResponseEntity<ApiResponse<java.util.Map<String, Object>>> checkUsername(
            @RequestParam String username) {
        boolean available = !authService.usernameExists(username);
        return ResponseEntity.ok(ApiResponse.success(
                java.util.Map.of("username", username, "available", available), "ok"));
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
    public ResponseEntity<ApiResponse<LoginResponse>> login(
            @Valid @RequestBody LoginRequest request,
            @RequestHeader(value = "X-Device-Token", required = false) String deviceToken,
            HttpServletRequest httpRequest,
            HttpServletResponse response) {
        if (!rateLimiter.tryConsumeLogin(getClientIp(httpRequest))) {
            return ResponseEntity.status(429).body(ApiResponse.error("RATE_LIMIT_001", "Too many login attempts. Please try again later."));
        }
        LoginResponse loginResponse = authService.login(request, deviceToken);
        if (loginResponse.getAuthResponse() != null) {
            setRefreshCookie(response, loginResponse.getAuthResponse().getRefreshToken());
        }
        return ResponseEntity.ok(ApiResponse.success(loginResponse, "Login successful"));
    }

    // ── Step 1b: resend OTP (same session, rate-limited by OtpService) ─────────

    @PostMapping("/resend-login-otp")
    public ResponseEntity<ApiResponse<Void>> resendLoginOtp(
            @RequestBody java.util.Map<String, String> body,
            HttpServletRequest httpRequest) {
        if (!rateLimiter.tryConsumeLogin(getClientIp(httpRequest))) {
            return ResponseEntity.status(429).body(ApiResponse.error("RATE_LIMIT_001", "Too many attempts. Please try again later."));
        }
        authService.resendLoginOtp(body.get("otpToken"));
        return ResponseEntity.ok(ApiResponse.success(null, "OTP resent"));
    }

    // ── Step 1c: verify OTP after login (for ADMIN/MANAGER/SUPER_ADMIN) ──────

    @PostMapping("/verify-login-otp")
    public ResponseEntity<ApiResponse<LoginResponse>> verifyLoginOtp(
            @Valid @RequestBody VerifyLoginOtpRequest request,
            HttpServletRequest httpRequest,
            HttpServletResponse response) {
        if (!rateLimiter.tryConsumeLogin(getClientIp(httpRequest))) {
            return ResponseEntity.status(429).body(ApiResponse.error("RATE_LIMIT_001", "Too many attempts. Please try again later."));
        }
        LoginResponse loginResponse = authService.verifyLoginOtp(request.getOtpToken(), request.getCode(), request.isRememberDevice());
        if (loginResponse.getAuthResponse() != null) {
            setRefreshCookie(response, loginResponse.getAuthResponse().getRefreshToken());
        }
        return ResponseEntity.ok(ApiResponse.success(loginResponse, "OTP verified"));
    }

    // ── Step 2: select tenant → scoped access token ──────────────────────────

    @PostMapping("/select-tenant")
    public ResponseEntity<ApiResponse<AuthResponse>> selectTenant(
            @Valid @RequestBody SelectTenantRequest request,
            HttpServletResponse response) {
        AuthResponse auth = authService.selectTenant(request);
        setRefreshCookie(response, auth.getRefreshToken());
        return ResponseEntity.ok(ApiResponse.success(auth, "Tenant selected"));
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
    public ResponseEntity<ApiResponse<AuthResponse>> refresh(
            @RequestBody(required = false) RefreshTokenRequest request,
            @CookieValue(name = "refresh_token", required = false) String cookieToken,
            HttpServletResponse response) {
        String tokenValue = (request != null && request.getRefreshToken() != null && !request.getRefreshToken().isBlank())
                ? request.getRefreshToken() : cookieToken;
        if (tokenValue == null || tokenValue.isBlank()) {
            throw new BusinessException(ErrorCode.TOKEN_INVALID, "No refresh token provided");
        }
        AuthResponse auth = authService.refreshByToken(tokenValue);
        setRefreshCookie(response, auth.getRefreshToken());
        return ResponseEntity.ok(ApiResponse.success(auth));
    }

    @PostMapping("/logout")
    public ResponseEntity<ApiResponse<Void>> logout(
            @RequestBody(required = false) RefreshTokenRequest request,
            @CookieValue(name = "refresh_token", required = false) String cookieToken,
            HttpServletResponse response) {
        clearRefreshCookie(response);
        String tokenValue = (request != null && request.getRefreshToken() != null) ? request.getRefreshToken() : cookieToken;
        if (tokenValue != null) authService.logout(tokenValue);
        return ResponseEntity.ok(ApiResponse.success(null, "Logged out successfully"));
    }

    @PostMapping("/logout-all")
    public ResponseEntity<ApiResponse<Void>> logoutAll(
            @AuthenticationPrincipal User user,
            HttpServletResponse response) {
        if (user == null) throw new BusinessException(ErrorCode.UNAUTHORIZED);
        clearRefreshCookie(response);
        authService.logoutAll(user.getId());
        return ResponseEntity.ok(ApiResponse.success(null, "Logged out from all devices"));
    }

    // ── Self-service password reset — 4-step flow ───────────────────────────

    @PostMapping("/forgot-password/lookup")
    public ResponseEntity<ApiResponse<ForgotPasswordLookupResponse>> forgotPasswordLookup(
            @Valid @RequestBody ForgotPasswordLookupRequest req,
            HttpServletRequest httpRequest) {
        if (!rateLimiter.tryConsumeForgot(getClientIp(httpRequest))) {
            return ResponseEntity.status(429).body(ApiResponse.error("RATE_LIMIT_001", "Too many requests. Please wait before trying again."));
        }
        return ResponseEntity.ok(ApiResponse.success(
                authService.lookupForPasswordReset(req.getUsernameOrPhone())));
    }

    @PostMapping("/forgot-password/send-otp")
    public ResponseEntity<ApiResponse<Void>> forgotPasswordSendOtp(
            @Valid @RequestBody ForgotPasswordSendOtpRequest req,
            HttpServletRequest httpRequest) {
        if (!rateLimiter.tryConsumeForgot(getClientIp(httpRequest))) {
            return ResponseEntity.status(429).body(ApiResponse.error("RATE_LIMIT_001", "Too many requests. Please wait before trying again."));
        }
        authService.sendForgotPasswordOtpNew(req.getUserId(), req.getLast4());
        return ResponseEntity.ok(ApiResponse.success(null, "OTP sent to your registered phone number"));
    }

    @PostMapping("/forgot-password/verify-otp")
    public ResponseEntity<ApiResponse<ForgotPasswordVerifyOtpResponse>> forgotPasswordVerifyOtp(
            @Valid @RequestBody ForgotPasswordVerifyOtpRequest req,
            HttpServletRequest httpRequest) {
        if (!rateLimiter.tryConsumeForgot(getClientIp(httpRequest))) {
            return ResponseEntity.status(429).body(ApiResponse.error("RATE_LIMIT_001", "Too many requests. Please wait before trying again."));
        }
        return ResponseEntity.ok(ApiResponse.success(
                authService.verifyForgotPasswordOtp(req.getUserId(), req.getCode())));
    }

    @PostMapping("/forgot-password/reset-with-token")
    public ResponseEntity<ApiResponse<Void>> forgotPasswordResetWithToken(
            @Valid @RequestBody ForgotPasswordResetWithTokenRequest req,
            HttpServletRequest httpRequest) {
        if (!rateLimiter.tryConsumeForgot(getClientIp(httpRequest))) {
            return ResponseEntity.status(429).body(ApiResponse.error("RATE_LIMIT_001", "Too many requests. Please wait before trying again."));
        }
        authService.resetPasswordWithToken(req.getResetToken(), req.getNewPassword());
        return ResponseEntity.ok(ApiResponse.success(null, "Password reset successfully. You can now sign in."));
    }

    // ── Legacy: self-service password reset via mobile OTP ───────────────────

    @PostMapping("/forgot-password/send")
    public ResponseEntity<ApiResponse<Void>> sendForgotPasswordOtp(
            @Valid @RequestBody SendPhoneOtpRequest req,
            HttpServletRequest httpRequest) {
        if (!rateLimiter.tryConsumeForgot(getClientIp(httpRequest))) {
            return ResponseEntity.status(429).body(ApiResponse.error("RATE_LIMIT_001", "Too many requests. Please wait before trying again."));
        }
        authService.sendForgotPasswordOtp(req.getPhone(), req.getCountryCode());
        return ResponseEntity.ok(ApiResponse.success(null, "If an account exists for this number, an OTP has been sent"));
    }

    @PostMapping("/forgot-password/reset")
    public ResponseEntity<ApiResponse<Void>> resetPasswordViaOtp(
            @Valid @RequestBody ForgotPasswordResetRequest req,
            HttpServletRequest httpRequest) {
        if (!rateLimiter.tryConsumeForgot(getClientIp(httpRequest))) {
            return ResponseEntity.status(429).body(ApiResponse.error("RATE_LIMIT_001", "Too many requests. Please wait before trying again."));
        }
        authService.resetPasswordViaOtp(req);
        return ResponseEntity.ok(ApiResponse.success(null, "Password reset successfully. Please sign in with your new password."));
    }

    // ── Mobile login (2-step) ────────────────────────────────────────────────

    @PostMapping("/mobile-lookup")
    public ResponseEntity<ApiResponse<MobileLookupResponse>> mobileLookup(
            @RequestParam String phone,
            @RequestParam String phoneCountryCode,
            HttpServletRequest httpRequest) {
        if (!rateLimiter.tryConsumeLogin(getClientIp(httpRequest))) {
            return ResponseEntity.status(429).body(ApiResponse.error("RATE_LIMIT_001", "Too many requests. Please wait before trying again."));
        }
        return ResponseEntity.ok(ApiResponse.success(authService.lookupByMobile(phone, phoneCountryCode)));
    }

    @PostMapping("/login-mobile")
    public ResponseEntity<ApiResponse<LoginResponse>> loginByMobile(
            @Valid @RequestBody MobileLoginRequest request,
            HttpServletRequest httpRequest,
            HttpServletResponse response) {
        if (!rateLimiter.tryConsumeLogin(getClientIp(httpRequest))) {
            return ResponseEntity.status(429).body(ApiResponse.error("RATE_LIMIT_001", "Too many login attempts. Please try again later."));
        }
        LoginResponse loginResponse = authService.loginByMobile(request);
        if (loginResponse.getAuthResponse() != null) {
            setRefreshCookie(response, loginResponse.getAuthResponse().getRefreshToken());
        }
        return ResponseEntity.ok(ApiResponse.success(loginResponse, "Login successful"));
    }

    // ── Cookie helpers ────────────────────────────────────────────────────────

    private void setRefreshCookie(HttpServletResponse response, String refreshToken) {
        if (refreshToken == null) return;
        ResponseCookie cookie = ResponseCookie.from("refresh_token", refreshToken)
                .httpOnly(true)
                .secure(true)
                .sameSite("Strict")
                .path("/api/auth/refresh")
                .maxAge(Duration.ofDays(30))
                .build();
        response.addHeader(HttpHeaders.SET_COOKIE, cookie.toString());
    }

    private void clearRefreshCookie(HttpServletResponse response) {
        ResponseCookie cookie = ResponseCookie.from("refresh_token", "")
                .httpOnly(true)
                .secure(true)
                .sameSite("Strict")
                .path("/api/auth/refresh")
                .maxAge(Duration.ZERO)
                .build();
        response.addHeader(HttpHeaders.SET_COOKIE, cookie.toString());
    }

    private String getClientIp(HttpServletRequest request) {
        String realIp = request.getHeader("X-Real-IP");
        if (realIp != null && !realIp.isBlank()) return realIp.trim();
        return request.getRemoteAddr();
    }
}
