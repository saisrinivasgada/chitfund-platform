package com.chitfund.paymentservice.controller;

import com.chitfund.common.context.TenantContext;
import com.chitfund.common.dto.ApiResponse;
import com.chitfund.paymentservice.client.MemberServiceClient;
import com.chitfund.paymentservice.dto.request.ApproveIntimationRequest;
import com.chitfund.paymentservice.dto.request.CreateIntimationRequest;
import com.chitfund.paymentservice.dto.request.IntimationDecisionRequest;
import com.chitfund.paymentservice.dto.response.IntimationResponse;
import com.chitfund.paymentservice.dto.response.PaymentIntimationAuditLogResponse;
import com.chitfund.paymentservice.service.PaymentIntimationService;
import com.chitfund.common.exception.BusinessException;
import com.chitfund.common.exception.ErrorCode;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/payments/intimations")
@RequiredArgsConstructor
public class PaymentIntimationController {

    private final PaymentIntimationService intimationService;
    private final MemberServiceClient memberServiceClient;

    /** Member: report a payment the admin forgot to record. */
    @PostMapping
    @PreAuthorize("hasAuthority('ROLE_MEMBER')")
    public ResponseEntity<ApiResponse<IntimationResponse>> create(
            @Valid @RequestBody CreateIntimationRequest request,
            Authentication auth) {
        UUID userId = (UUID) auth.getPrincipal();
        UUID memberId = requireMemberProfile(userId);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success(intimationService.createIntimation(memberId, request)));
    }

    /** Member: withdraw a pending intimation before admin acts. */
    @PostMapping("/{id}/withdraw")
    @PreAuthorize("hasAuthority('ROLE_MEMBER')")
    public ResponseEntity<ApiResponse<IntimationResponse>> withdraw(
            @PathVariable String id,
            Authentication auth) {
        UUID userId = (UUID) auth.getPrincipal();
        UUID memberId = requireMemberProfile(userId);
        return ResponseEntity.ok(ApiResponse.success(intimationService.withdrawIntimation(id, memberId)));
    }

    /** Member: all their own intimations. */
    @GetMapping("/mine")
    @PreAuthorize("hasAuthority('ROLE_MEMBER')")
    public ResponseEntity<ApiResponse<List<IntimationResponse>>> getMyIntimations(Authentication auth) {
        UUID userId = (UUID) auth.getPrincipal();
        UUID memberId = requireMemberProfile(userId);
        return ResponseEntity.ok(ApiResponse.success(intimationService.getMyIntimations(memberId)));
    }

    /** Admin/Manager: all PENDING intimations — badge count on dashboard. */
    @GetMapping("/pending")
    @PreAuthorize("hasAuthority('ROLE_ADMIN') or hasAuthority('ROLE_MANAGER')")
    public ResponseEntity<ApiResponse<List<IntimationResponse>>> getPending() {
        return ResponseEntity.ok(ApiResponse.success(intimationService.getPendingIntimations()));
    }

    /** Admin/Manager: full history (all statuses). */
    @GetMapping
    @PreAuthorize("hasAuthority('ROLE_ADMIN') or hasAuthority('ROLE_MANAGER')")
    public ResponseEntity<ApiResponse<List<IntimationResponse>>> getAll() {
        return ResponseEntity.ok(ApiResponse.success(intimationService.getAllIntimations()));
    }

    /** Admin/Manager: single intimation detail. */
    @GetMapping("/{id}")
    @PreAuthorize("hasAuthority('ROLE_ADMIN') or hasAuthority('ROLE_MANAGER') or hasAuthority('ROLE_MEMBER')")
    public ResponseEntity<ApiResponse<IntimationResponse>> getById(
            @PathVariable String id, Authentication auth) {
        if (isMember(auth)) {
            return ResponseEntity.ok(ApiResponse.success(intimationService.getOwnedById(
                    id, requireMemberProfile((UUID) auth.getPrincipal()))));
        }
        return ResponseEntity.ok(ApiResponse.success(intimationService.getById(id)));
    }

    /** All roles: audit trail for a single intimation. */
    @GetMapping("/{id}/history")
    @PreAuthorize("hasAuthority('ROLE_ADMIN') or hasAuthority('ROLE_MANAGER') or hasAuthority('ROLE_MEMBER')")
    public ResponseEntity<ApiResponse<List<PaymentIntimationAuditLogResponse>>> getHistory(
            @PathVariable String id, Authentication auth) {
        if (isMember(auth)) {
            return ResponseEntity.ok(ApiResponse.success(intimationService.getOwnedHistory(
                    id, requireMemberProfile((UUID) auth.getPrincipal()))));
        }
        return ResponseEntity.ok(ApiResponse.success(intimationService.getHistory(id)));
    }

    /** Admin/Manager: approve with optional per-item amount edits. */
    @PostMapping("/{id}/approve")
    @PreAuthorize("hasAuthority('ROLE_ADMIN')")
    public ResponseEntity<ApiResponse<IntimationResponse>> approve(
            @PathVariable String id,
            @Valid @RequestBody ApproveIntimationRequest request,
            Authentication auth) {
        UUID adminId = (UUID) auth.getPrincipal();
        return ResponseEntity.ok(ApiResponse.success(intimationService.approveIntimation(id, adminId, request, actorRole(auth))));
    }

    /** Admin/Manager: reject with a reason. */
    @PostMapping("/{id}/reject")
    @PreAuthorize("hasAuthority('ROLE_ADMIN')")
    public ResponseEntity<ApiResponse<IntimationResponse>> reject(
            @PathVariable String id,
            @Valid @RequestBody IntimationDecisionRequest request,
            Authentication auth) {
        UUID adminId = (UUID) auth.getPrincipal();
        return ResponseEntity.ok(ApiResponse.success(
                intimationService.rejectIntimation(id, adminId, request.getReason(), actorRole(auth))));
    }

    /** Admin: void an already-approved intimation — reverses all created payment batches. */
    @PostMapping("/{id}/void")
    @PreAuthorize("hasAuthority('ROLE_ADMIN')")
    public ResponseEntity<ApiResponse<IntimationResponse>> voidIntimation(
            @PathVariable String id,
            @Valid @RequestBody IntimationDecisionRequest request,
            Authentication auth) {
        UUID adminId = (UUID) auth.getPrincipal();
        return ResponseEntity.ok(ApiResponse.success(
                intimationService.voidIntimation(id, adminId, request.getReason(), actorRole(auth))));
    }

    private UUID requireMemberProfile(UUID userId) {
        UUID profileId = memberServiceClient.getProfileIdByUserId(userId, TenantContext.get());
        if (profileId == null) {
            throw new BusinessException(ErrorCode.FORBIDDEN,
                    "No member profile is linked to this organization");
        }
        return profileId;
    }

    private boolean isMember(Authentication auth) {
        return auth.getAuthorities().stream()
                .anyMatch(authority -> "ROLE_MEMBER".equals(authority.getAuthority()));
    }

    /** Record the effective actor role so audit/history UI can explain who acted. */
    private static String actorRole(Authentication auth) {
        return auth.getAuthorities().stream()
                .map(a -> a.getAuthority().replaceFirst("^ROLE_", ""))
                .filter(r -> r.equals("ADMIN") || r.equals("MANAGER"))
                .findFirst()
                .orElse("ADMIN");
    }
}
