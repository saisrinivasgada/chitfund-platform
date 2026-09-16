package com.chitfund.userservice.controller;

import com.chitfund.common.dto.ApiResponse;
import com.chitfund.userservice.domain.entity.User;
import com.chitfund.userservice.dto.request.SetupAccountRequest;
import com.chitfund.userservice.dto.request.SetupEmailOtpRequest;
import com.chitfund.userservice.dto.request.VerifyChitfundRequestOtpRequest;
import com.chitfund.userservice.dto.request.ChitfundRequestEmailRecoveryRequest;
import com.chitfund.userservice.dto.response.ChitfundRequestResponse;
import com.chitfund.userservice.dto.response.ChitfundRequestPublicResponse;
import com.chitfund.userservice.service.ChitfundRequestService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/chitfund-requests")
@RequiredArgsConstructor
public class ChitfundRequestController {
    private final ChitfundRequestService service;

    @GetMapping("/public")
    public ResponseEntity<ApiResponse<ChitfundRequestPublicResponse>> publicDetails(@RequestParam String token) {
        return ResponseEntity.ok(ApiResponse.success(service.publicDetails(token)));
    }

    @PostMapping("/recovery/email-otp")
    public ResponseEntity<ApiResponse<Void>> sendRecoveryEmailOtp(
            @Valid @RequestBody ChitfundRequestEmailRecoveryRequest request) {
        service.sendRequestRecoveryEmailOtp(request.getToken());
        return ResponseEntity.ok(ApiResponse.success(null, "If a verified email is available, an OTP has been sent"));
    }

    @PostMapping("/recovery/verify-email-otp")
    public ResponseEntity<ApiResponse<java.util.Map<String, String>>> verifyRecoveryEmailOtp(
            @Valid @RequestBody ChitfundRequestEmailRecoveryRequest request) {
        String resetToken = service.verifyRequestRecoveryEmailOtp(request.getToken(), request.getCode());
        return ResponseEntity.ok(ApiResponse.success(java.util.Map.of("resetToken", resetToken)));
    }

    @PostMapping("/setup/email-otp")
    public ResponseEntity<ApiResponse<Void>> sendSetupEmailOtp(@Valid @RequestBody SetupEmailOtpRequest request) {
        service.sendSetupEmailOtp(request.getToken(), request.getEmail());
        return ResponseEntity.ok(ApiResponse.success(null, "Email OTP sent"));
    }

    @PostMapping("/setup")
    public ResponseEntity<ApiResponse<ChitfundRequestResponse>> completeSetup(
            @Valid @RequestBody SetupAccountRequest request) {
        return ResponseEntity.ok(ApiResponse.success(service.completeSetup(request),
                "Account verified. Your organization must confirm app access."));
    }

    @GetMapping("/mine")
    @PreAuthorize("hasAuthority('MEMBER')")
    public ResponseEntity<ApiResponse<List<ChitfundRequestResponse>>> mine(Authentication authentication) {
        User user = (User) authentication.getPrincipal();
        return ResponseEntity.ok(ApiResponse.success(service.mine(user.getId())));
    }

    @PostMapping("/{requestId}/otp")
    @PreAuthorize("hasAuthority('MEMBER')")
    public ResponseEntity<ApiResponse<Void>> sendAcceptOtp(@PathVariable UUID requestId,
                                                            Authentication authentication) {
        User user = (User) authentication.getPrincipal();
        service.sendAcceptOtp(requestId, user.getId());
        return ResponseEntity.ok(ApiResponse.success(null, "OTP sent"));
    }

    @PostMapping("/{requestId}/accept")
    @PreAuthorize("hasAuthority('MEMBER')")
    public ResponseEntity<ApiResponse<ChitfundRequestResponse>> accept(
            @PathVariable UUID requestId,
            @Valid @RequestBody VerifyChitfundRequestOtpRequest request,
            Authentication authentication) {
        User user = (User) authentication.getPrincipal();
        return ResponseEntity.ok(ApiResponse.success(service.accept(requestId, user.getId(), request.getCode()),
                "Request verified. Waiting for organization confirmation."));
    }

    @PostMapping("/{requestId}/decline")
    @PreAuthorize("hasAuthority('MEMBER')")
    public ResponseEntity<ApiResponse<ChitfundRequestResponse>> decline(
            @PathVariable UUID requestId, Authentication authentication) {
        User user = (User) authentication.getPrincipal();
        return ResponseEntity.ok(ApiResponse.success(service.decline(requestId, user.getId())));
    }

    @GetMapping("/admin/member/{memberId}")
    @PreAuthorize("hasAnyAuthority('ADMIN','MANAGER')")
    public ResponseEntity<ApiResponse<List<ChitfundRequestResponse>>> forMember(@PathVariable UUID memberId) {
        return ResponseEntity.ok(ApiResponse.success(service.forMember(memberId)));
    }

    @PostMapping("/{requestId}/resend")
    @PreAuthorize("hasAnyAuthority('ADMIN','MANAGER')")
    public ResponseEntity<ApiResponse<ChitfundRequestResponse>> resend(
            @PathVariable UUID requestId, Authentication authentication) {
        User user = (User) authentication.getPrincipal();
        return ResponseEntity.ok(ApiResponse.success(service.resend(requestId, user.getId())));
    }

    @PostMapping("/{requestId}/revoke")
    @PreAuthorize("hasAnyAuthority('ADMIN','MANAGER')")
    public ResponseEntity<ApiResponse<ChitfundRequestResponse>> revoke(@PathVariable UUID requestId) {
        return ResponseEntity.ok(ApiResponse.success(service.revoke(requestId)));
    }

    @PostMapping("/{requestId}/confirm")
    @PreAuthorize("hasAuthority('ADMIN')")
    public ResponseEntity<ApiResponse<ChitfundRequestResponse>> confirm(
            @PathVariable UUID requestId, Authentication authentication) {
        User user = (User) authentication.getPrincipal();
        return ResponseEntity.ok(ApiResponse.success(service.confirm(requestId, user.getId()),
                "Member app access activated"));
    }
}
