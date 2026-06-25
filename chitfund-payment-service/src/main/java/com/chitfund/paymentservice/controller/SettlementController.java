package com.chitfund.paymentservice.controller;

import com.chitfund.common.dto.ApiResponse;
import com.chitfund.paymentservice.dto.request.ConfirmSettlementRequest;
import com.chitfund.paymentservice.dto.request.SettlementPreviewRequest;
import com.chitfund.paymentservice.dto.response.SettlementPreviewResponse;
import com.chitfund.paymentservice.dto.response.SettlementResponse;
import com.chitfund.paymentservice.service.SettlementService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

/**
 * Settlement endpoints — ADMIN and MANAGER only.
 *
 * WHY restrict to ADMIN/MANAGER?
 * Settlement is a financially irreversible operation — it wipes open payment obligations.
 * Workers have no business running settlements; members certainly don't.
 *
 * Three endpoints:
 *  POST /api/settlement/preview  — non-destructive calculation, safe to call repeatedly
 *  POST /api/settlement/confirm  — executes the settlement (irreversible)
 *  GET  /api/settlement/member/{memberId} — history of past settlements for a member
 */
@RestController
@RequestMapping("/settlement")
@RequiredArgsConstructor
public class SettlementController {

    private final SettlementService settlementService;

    /**
     * Computes the settlement preview for a member across their chits.
     * Read-only — no database changes. Safe to call multiple times.
     *
     * The frontend calls this immediately on member selection and also when the admin
     * toggles the mode on a CASE_C row (by re-submitting with updated chitIds/mode).
     */
    @PostMapping("/preview")
    @PreAuthorize("hasRole('ROLE_ADMIN') or hasRole('ROLE_MANAGER')")
    public ResponseEntity<ApiResponse<SettlementPreviewResponse>> preview(
            @Valid @RequestBody SettlementPreviewRequest request) {
        return ResponseEntity.ok(ApiResponse.success(settlementService.preview(request)));
    }

    /**
     * Executes the settlement. Irreversible — marks PaymentRecords as SETTLEMENT_CLEARED,
     * saves Settlement + SettlementChitItem records, and creates an AdminWalletEntry.
     */
    @PostMapping("/confirm")
    @PreAuthorize("hasRole('ROLE_ADMIN')")
    public ResponseEntity<ApiResponse<SettlementResponse>> confirm(
            @Valid @RequestBody ConfirmSettlementRequest request,
            Authentication auth) {
        UUID adminId = (UUID) auth.getPrincipal();
        SettlementResponse response = settlementService.confirm(request, adminId);
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(response, "Settlement confirmed"));
    }

    /**
     * Returns past settlements for a member, newest first.
     * Used in the Settlement history section of the frontend.
     */
    @GetMapping("/member/{memberId}")
    @PreAuthorize("hasRole('ROLE_ADMIN') or hasRole('ROLE_MANAGER')")
    public ResponseEntity<ApiResponse<List<SettlementResponse>>> getMemberSettlements(
            @PathVariable UUID memberId) {
        return ResponseEntity.ok(ApiResponse.success(settlementService.getSettlementsForMember(memberId)));
    }
}
