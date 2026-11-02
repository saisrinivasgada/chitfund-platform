package com.chitfund.userservice.controller;

import com.chitfund.common.dto.ApiResponse;
import com.chitfund.userservice.dto.request.OrgUserSetupCompleteRequest;
import com.chitfund.userservice.dto.request.OrgUserSetupEmailOtpRequest;
import com.chitfund.userservice.dto.response.OrgUserSetupPublicResponse;
import com.chitfund.userservice.service.OrgUserSetupService;
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

    @GetMapping
    public ResponseEntity<ApiResponse<OrgUserSetupPublicResponse>> getDetails(
            @RequestParam("token") String token) {
        return ResponseEntity.ok(ApiResponse.success(
                service.getPublicDetails(token), "Setup token details"));
    }

    @PostMapping("/email-otp")
    public ResponseEntity<ApiResponse<Void>> sendEmailOtp(
            @Valid @RequestBody OrgUserSetupEmailOtpRequest request) {
        service.sendEmailOtp(request);
        return ResponseEntity.ok(ApiResponse.success(null,
                "Verification code sent to your registered email address"));
    }

    @PostMapping("/complete")
    public ResponseEntity<ApiResponse<Void>> complete(
            @Valid @RequestBody OrgUserSetupCompleteRequest request) {
        service.complete(request);
        return ResponseEntity.ok(ApiResponse.success(null,
                "Account setup complete. You can now sign in."));
    }
}
