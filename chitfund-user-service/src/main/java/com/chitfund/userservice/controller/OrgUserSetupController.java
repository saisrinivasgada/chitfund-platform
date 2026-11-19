package com.chitfund.userservice.controller;

import com.chitfund.common.dto.ApiResponse;
import com.chitfund.userservice.dto.request.OrgUserSetupCompleteRequest;
import com.chitfund.userservice.dto.request.OrgUserSetupEmailOtpRequest;
import com.chitfund.userservice.dto.response.OrgUserSetupPublicResponse;
import com.chitfund.userservice.service.OrgUserSetupService;
import com.chitfund.userservice.service.RateLimiterService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/**
 * Org-user account-setup endpoints — public (pre-authentication).
 * Only accepts ORG_USER_INVITE purpose tokens; rejects CHITFUND_REQUEST tokens.
 */
@RestController
@RequestMapping("/api/auth/org-user-setup")
@RequiredArgsConstructor
public class OrgUserSetupController {

    private final OrgUserSetupService service;
    private final RateLimiterService rateLimiter;

    @GetMapping
    public ResponseEntity<ApiResponse<OrgUserSetupPublicResponse>> getDetails(
            @RequestParam("token") String token,
            HttpServletRequest httpRequest) {
        if (!rateLimiter.tryConsumeOrgUserSetupOtp(getClientIp(httpRequest))) {
            return ResponseEntity.status(429).body(ApiResponse.error(
                    "RATE_LIMIT_001", "Too many requests. Please wait before trying again."));
        }
        return ResponseEntity.ok(ApiResponse.success(
                service.getPublicDetails(token), "Setup token details"));
    }

    @PostMapping("/email-otp")
    public ResponseEntity<ApiResponse<java.util.Map<String, String>>> sendEmailOtp(
            @Valid @RequestBody OrgUserSetupEmailOtpRequest request,
            HttpServletRequest httpRequest) {
        if (!rateLimiter.tryConsumeOrgUserSetupOtp(getClientIp(httpRequest))) {
            return ResponseEntity.status(429).body(ApiResponse.error(
                    "RATE_LIMIT_001", "Too many requests. Please wait before trying again."));
        }
        String devOtp = service.sendEmailOtp(request);
        java.util.Map<String, String> data = devOtp != null ? java.util.Map.of("devOtp", devOtp) : null;
        return ResponseEntity.ok(ApiResponse.success(data,
                "Verification code sent to your registered email address"));
    }

    @PostMapping("/complete")
    public ResponseEntity<ApiResponse<Void>> complete(
            @Valid @RequestBody OrgUserSetupCompleteRequest request,
            HttpServletRequest httpRequest) {
        if (!rateLimiter.tryConsumeOrgUserSetupOtpVerify(getClientIp(httpRequest))) {
            return ResponseEntity.status(429).body(ApiResponse.error(
                    "RATE_LIMIT_001", "Too many attempts. Please wait before trying again."));
        }
        service.complete(request);
        return ResponseEntity.ok(ApiResponse.success(null,
                "Account setup complete. You can now sign in."));
    }

    // Trust only the gateway-set header; never the client-supplied X-Real-IP.
    private String getClientIp(HttpServletRequest request) {
        String trusted = request.getHeader("X-ChitWise-Client-IP");
        if (trusted != null && !trusted.isBlank()) return trusted.trim();
        return request.getRemoteAddr();
    }
}
