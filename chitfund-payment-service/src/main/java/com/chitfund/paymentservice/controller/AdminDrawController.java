package com.chitfund.paymentservice.controller;

import com.chitfund.common.dto.ApiResponse;
import com.chitfund.paymentservice.dto.request.OpenMonthRequest;
import com.chitfund.paymentservice.dto.request.SkipMonthRequest;
import com.chitfund.paymentservice.dto.response.DrawSummaryResponse;
import com.chitfund.paymentservice.dto.response.PaymentRecordResponse;
import com.chitfund.paymentservice.service.ChitMonthDrawService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/admin/draws")
@RequiredArgsConstructor
@PreAuthorize("hasRole('ROLE_ADMIN') or hasRole('ROLE_MANAGER')")
public class AdminDrawController {

    private final ChitMonthDrawService drawService;

    @Value("${app.internal-key:chitfund-internal-service-key}")
    private String internalKey;

    /**
     * Admin dashboard: shows all OPEN cycles with payment progress.
     * The UI uses this to show: "Chit X / Month 3 — 8 paid, 4 outstanding, due 2026-07-01"
     */
    @GetMapping("/dashboard")
    public ResponseEntity<ApiResponse<List<DrawSummaryResponse>>> getDashboard() {
        return ResponseEntity.ok(ApiResponse.success(drawService.getDashboard()));
    }

    /**
     * Admin opens a month: creates payment records for all enrolled members.
     * Call this when the month starts and you're ready to collect installments.
     */
    @PostMapping("/open")
    public ResponseEntity<ApiResponse<DrawSummaryResponse>> openMonth(
            @Valid @RequestBody OpenMonthRequest request,
            Authentication auth) {
        UUID adminId = (UUID) auth.getPrincipal();
        DrawSummaryResponse response = drawService.openMonth(request, adminId);
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(response));
    }

    /**
     * Admin skips a month (e.g. COVID, festival, admin decision).
     * - Creates WAIVED payment records for all members (for audit/reporting)
     * - Publishes ChitMonthSkippedEvent → notifies members + workers + extends chit end date
     */
    @PostMapping("/skip")
    public ResponseEntity<ApiResponse<DrawSummaryResponse>> skipMonth(
            @Valid @RequestBody SkipMonthRequest request,
            Authentication auth) {
        UUID adminId = (UUID) auth.getPrincipal();
        DrawSummaryResponse response = drawService.skipMonth(request, adminId);
        return ResponseEntity.ok(ApiResponse.success(response));
    }

    /**
     * Admin closes an open month — marks collection period as over.
     * Works even if some members are still OUTSTANDING (force-close).
     */
    @PostMapping("/{id}/close")
    public ResponseEntity<ApiResponse<DrawSummaryResponse>> closeMonth(
            @PathVariable UUID id,
            Authentication auth) {
        UUID adminId = (UUID) auth.getPrincipal();
        return ResponseEntity.ok(ApiResponse.success(drawService.closeMonth(id, adminId)));
    }

    /**
     * All cycles (open + skipped + closed) for a specific chit — used for chit-level audit view.
     */
    @GetMapping("/chit/{chitId}")
    public ResponseEntity<ApiResponse<List<DrawSummaryResponse>>> getCyclesForChit(
            @PathVariable UUID chitId) {
        return ResponseEntity.ok(ApiResponse.success(drawService.getCyclesForChit(chitId)));
    }

    /**
     * Per-member payment records for a specific cycle — powers the cycle detail view.
     * Shows each member's amountDue, amountPaid, balance and status (OUTSTANDING / PARTIALLY_PAID / SETTLED / WAIVED).
     */
    @GetMapping("/{cycleId}/payments")
    public ResponseEntity<ApiResponse<List<PaymentRecordResponse>>> getCyclePayments(
            @PathVariable UUID cycleId) {
        return ResponseEntity.ok(ApiResponse.success(drawService.getCyclePayments(cycleId)));
    }

    /**
     * Deletes an accidentally-opened cycle and all its payment records.
     * Blocked if any member has already paid — admin must void those batches first.
     */
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteDraw(
            @PathVariable UUID id,
            Authentication auth) {
        UUID adminId = (UUID) auth.getPrincipal();
        drawService.deleteDraw(id, adminId);
        return ResponseEntity.noContent().build();
    }

    /**
     * Returns the highest cycle number opened so far for each requested chit.
     * Used by the chit list page to show an amber "behind" indicator when
     * an active chit hasn't had a cycle opened for the current expected month.
     * chitIds = comma-separated UUIDs
     */
    @GetMapping("/latest-numbers")
    public ResponseEntity<ApiResponse<Map<UUID, Integer>>> getLatestCycleNumbers(
            @RequestParam String chitIds) {
        List<UUID> ids = Arrays.stream(chitIds.split(","))
                .map(String::trim).filter(s -> !s.isEmpty()).map(UUID::fromString)
                .collect(Collectors.toList());
        return ResponseEntity.ok(ApiResponse.success(drawService.getLatestCycleNumbers(ids)));
    }

    /** All draws opened, closed, or skipped today — used in the daily activity feed. */
    @GetMapping("/today")
    public ResponseEntity<ApiResponse<List<DrawSummaryResponse>>> getTodaysDraws() {
        return ResponseEntity.ok(ApiResponse.success(drawService.getTodaysDraws()));
    }

    /**
     * Internal endpoint — called by chit-service when a chit is completed.
     * Auto-closes all OPEN draws so they don't pollute the admin dashboard.
     */
    @PostMapping("/internal/close-for-chit/{chitId}")
    @PreAuthorize("true")
    public ResponseEntity<Void> closeDrawsForChit(
            @PathVariable UUID chitId,
            @RequestHeader(value = "X-Internal-Key", required = false) String key) {
        if (!internalKey.equals(key)) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        drawService.closeOpenDrawsForChit(chitId);
        return ResponseEntity.ok().build();
    }
}
