package com.chitfund.paymentservice.controller;

import com.chitfund.paymentservice.dto.request.CreateLateJoinDuesRequest;
import com.chitfund.paymentservice.dto.response.LateJoinPreviewResponse;
import com.chitfund.paymentservice.service.LateJoinService;
import com.chitfund.common.context.TenantContext;
import com.chitfund.common.dto.ApiResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.UUID;

@RestController
@RequiredArgsConstructor
public class LateJoinController {

    private final LateJoinService lateJoinService;

    @Value("${app.internal-key:chitfund-internal-service-key}")
    private String internalKey;

    /**
     * Admin-facing read-only preview. Shows what catch-up dues a member would owe
     * if approved into an already-running chit. No side effects.
     */
    @GetMapping("/admin/payments/late-join-preview")
    @PreAuthorize("hasAuthority('ROLE_ADMIN') or hasAuthority('ROLE_MANAGER')")
    public ResponseEntity<ApiResponse<LateJoinPreviewResponse>> preview(
            @RequestParam UUID chitId,
            @RequestParam UUID memberId) {
        String tenantId = TenantContext.get();
        LateJoinPreviewResponse response = lateJoinService.preview(chitId, memberId, tenantId);
        return ResponseEntity.ok(ApiResponse.success(response));
    }

    /**
     * Internal endpoint called by chit-service after enrolling a member into an ACTIVE chit.
     * Idempotent — safe to call multiple times; already-posted months are skipped.
     * Authenticated via X-Internal-Key header; no JWT required.
     */
    @PostMapping("/admin/draws/internal/late-join-dues")
    public ResponseEntity<?> createLateJoinDues(
            @RequestHeader(value = "X-Internal-Key", required = false) String key,
            @RequestHeader(value = "X-Tenant-ID", required = false) String tenantId,
            @Valid @RequestBody CreateLateJoinDuesRequest request) {

        if (!internalKey.equals(key)) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        if (tenantId == null || tenantId.isBlank()) {
            return ResponseEntity.badRequest().body("X-Tenant-ID header is required");
        }

        TenantContext.set(tenantId);
        try {
            int created = lateJoinService.createDues(
                    request.getChitId(), request.getMemberId(), tenantId, request.getActorId());
            return ResponseEntity.ok(ApiResponse.success(
                    Map.of("createdCount", created),
                    created > 0
                            ? "Created " + created + " catch-up installment(s)"
                            : "No new catch-up installments — member is already up to date"));
        } finally {
            TenantContext.clear();
        }
    }
}
