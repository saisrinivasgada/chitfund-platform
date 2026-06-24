package com.chitfund.paymentservice.controller;

import com.chitfund.common.dto.ApiResponse;
import com.chitfund.paymentservice.dto.request.CollectCashRequest;
import com.chitfund.paymentservice.dto.request.MarkPayoutDeductedRequest;
import com.chitfund.paymentservice.dto.request.RecordPaymentRequest;
import com.chitfund.paymentservice.dto.request.VoidPaymentRequest;
import com.chitfund.paymentservice.dto.response.MemberBalanceResponse;
import com.chitfund.paymentservice.dto.response.PaymentBatchResponse;
import com.chitfund.paymentservice.dto.response.PaymentRecordResponse;
import com.chitfund.paymentservice.service.PaymentService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/payments")
@RequiredArgsConstructor
public class PaymentController {

    private final PaymentService paymentService;

    @Value("${app.internal-key:chitfund-internal-service-key}")
    private String internalKey;

    /**
     * Worker collects cash from a member during their rounds.
     * Creates AWAITING_REMITTANCE batch — payment_records NOT yet updated.
     * Admin must call /remit after receiving the cash from the worker.
     */
    @PostMapping("/collect")
    @PreAuthorize("hasRole('ROLE_ADMIN') or hasRole('ROLE_WORKER') or hasRole('ROLE_MANAGER')")
    public ResponseEntity<ApiResponse<PaymentBatchResponse>> collectCash(
            @Valid @RequestBody CollectCashRequest request,
            Authentication auth) {
        UUID workerId = (UUID) auth.getPrincipal();
        PaymentBatchResponse response = paymentService.collectCash(request, workerId);
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(response));
    }

    /**
     * Admin records a non-cash payment (UPI, bank transfer, cheque).
     * FIFO is applied immediately — payment_records updated in the same transaction.
     */
    @PostMapping
    @PreAuthorize("hasRole('ROLE_ADMIN') or hasRole('ROLE_MANAGER')")
    public ResponseEntity<ApiResponse<PaymentBatchResponse>> recordPayment(
            @Valid @RequestBody RecordPaymentRequest request,
            Authentication auth) {
        UUID adminId = (UUID) auth.getPrincipal();
        PaymentBatchResponse response = paymentService.recordPayment(request, adminId);
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(response));
    }

    /**
     * Admin confirms they received cash from the worker at end of day.
     * FIFO is applied here — this is when the member's payment is officially credited.
     */
    @PostMapping("/{batchId}/remit")
    @PreAuthorize("hasRole('ROLE_ADMIN') or hasRole('ROLE_MANAGER')")
    public ResponseEntity<ApiResponse<PaymentBatchResponse>> remitCash(
            @PathVariable UUID batchId,
            Authentication auth) {
        UUID adminId = (UUID) auth.getPrincipal();
        PaymentBatchResponse response = paymentService.remitCash(batchId, adminId);
        return ResponseEntity.ok(ApiResponse.success(response));
    }

    /**
     * All AWAITING_REMITTANCE batches — admin sees which workers still hold cash.
     */
    @GetMapping("/pending-remittance")
    @PreAuthorize("hasRole('ROLE_ADMIN') or hasRole('ROLE_MANAGER')")
    public ResponseEntity<ApiResponse<List<PaymentBatchResponse>>> getPendingRemittances() {
        return ResponseEntity.ok(ApiResponse.success(paymentService.getPendingRemittances()));
    }

    /**
     * Worker/Manager: AWAITING_REMITTANCE batches where they are the collector.
     * Covers admin-assigned direct collections (no CashPaymentRequest was created).
     */
    @GetMapping("/batches/mine")
    @PreAuthorize("hasRole('ROLE_WORKER') or hasRole('ROLE_MANAGER')")
    public ResponseEntity<ApiResponse<List<PaymentBatchResponse>>> getMyPendingBatches(Authentication auth) {
        UUID userId = (UUID) auth.getPrincipal();
        return ResponseEntity.ok(ApiResponse.success(paymentService.getMyPendingBatches(userId)));
    }

    /**
     * Admin/Manager: all batches (all statuses) where a specific person was the collector.
     * Used in StaffDetailPage to show a worker or manager's full collection history.
     */
    @GetMapping("/batches/collector/{collectorId}")
    @PreAuthorize("hasRole('ROLE_ADMIN') or hasRole('ROLE_MANAGER')")
    public ResponseEntity<ApiResponse<List<PaymentBatchResponse>>> getBatchesByCollector(
            @PathVariable UUID collectorId) {
        return ResponseEntity.ok(ApiResponse.success(paymentService.getBatchesByCollector(collectorId)));
    }

    /**
     * Admin/Manager: all payment batches with any activity today.
     * "Today" = created, remitted, or voided since midnight local time.
     */
    @GetMapping("/batches/today")
    @PreAuthorize("hasRole('ROLE_ADMIN') or hasRole('ROLE_MANAGER')")
    public ResponseEntity<ApiResponse<List<PaymentBatchResponse>>> getTodaysBatches() {
        return ResponseEntity.ok(ApiResponse.success(paymentService.getTodaysBatches()));
    }

    /**
     * Member's outstanding balance for a chit: total owed + breakdown by month (FIFO order).
     * Response: { totalOutstanding: ₹6000, months: [{month:2, balance:₹1000}, {month:3, balance:₹5000}] }
     */
    @GetMapping("/balance")
    @PreAuthorize("hasRole('ROLE_ADMIN') or hasRole('ROLE_WORKER') or hasRole('ROLE_MEMBER')")
    public ResponseEntity<ApiResponse<MemberBalanceResponse>> getMemberBalance(
            @RequestParam UUID memberId,
            @RequestParam UUID chitId) {
        return ResponseEntity.ok(ApiResponse.success(paymentService.getMemberBalance(memberId, chitId)));
    }

    /**
     * Total outstanding across all chits for a single member.
     * Used on the member detail page summary card.
     */
    @GetMapping("/balance/total")
    @PreAuthorize("hasRole('ROLE_ADMIN') or hasRole('ROLE_WORKER') or hasRole('ROLE_MEMBER')")
    public ResponseEntity<ApiResponse<BigDecimal>> getMemberTotalBalance(@RequestParam UUID memberId) {
        return ResponseEntity.ok(ApiResponse.success(paymentService.getMemberTotalBalance(memberId)));
    }

    /**
     * Bulk total outstanding across all chits for many members at once.
     * Used on the members list page — one call instead of N. Accepts comma-separated UUIDs.
     */
    @GetMapping("/balance/bulk")
    @PreAuthorize("hasRole('ROLE_ADMIN') or hasRole('ROLE_WORKER')")
    public ResponseEntity<ApiResponse<Map<UUID, BigDecimal>>> getMemberTotalBalanceBulk(
            @RequestParam String memberIds) {
        List<UUID> ids = Arrays.stream(memberIds.split(","))
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .map(UUID::fromString)
                .collect(Collectors.toList());
        return ResponseEntity.ok(ApiResponse.success(paymentService.getMemberTotalBalanceBulk(ids)));
    }

    /**
     * Full payment history for a member in a chit — all months including SETTLED and WAIVED.
     * Used in the member detail page to show a complete payment timeline.
     */
    @GetMapping("/history")
    @PreAuthorize("hasRole('ROLE_ADMIN') or hasRole('ROLE_WORKER') or hasRole('ROLE_MEMBER')")
    public ResponseEntity<ApiResponse<List<PaymentRecordResponse>>> getPaymentHistory(
            @RequestParam UUID memberId,
            @RequestParam UUID chitId) {
        return ResponseEntity.ok(ApiResponse.success(paymentService.getPaymentHistory(memberId, chitId)));
    }

    /**
     * All payment batches for a member in a chit (newest first).
     * Used in the Transactions tab of the PaymentHistoryModal.
     */
    @GetMapping("/batches")
    @PreAuthorize("hasRole('ROLE_ADMIN')")
    public ResponseEntity<ApiResponse<List<PaymentBatchResponse>>> getPaymentBatches(
            @RequestParam UUID memberId,
            @RequestParam UUID chitId) {
        return ResponseEntity.ok(ApiResponse.success(paymentService.getPaymentBatches(memberId, chitId)));
    }

    /**
     * Admin/Manager: all batches optionally filtered by chitId and/or memberId. Newest first.
     */
    @GetMapping("/batches/all")
    @PreAuthorize("hasRole('ROLE_ADMIN') or hasRole('ROLE_MANAGER')")
    public ResponseEntity<ApiResponse<List<PaymentBatchResponse>>> getAllBatches(
            @RequestParam(required = false) UUID chitId,
            @RequestParam(required = false) UUID memberId,
            @RequestParam(required = false) LocalDate fromDate,
            @RequestParam(required = false) LocalDate toDate) {
        return ResponseEntity.ok(ApiResponse.success(paymentService.getAllBatches(chitId, memberId, fromDate, toDate)));
    }

    /**
     * Full detail for a single payment batch by ID.
     * Used by the Transaction Detail page.
     */
    @GetMapping("/batches/{batchId}")
    @PreAuthorize("hasRole('ROLE_ADMIN') or hasRole('ROLE_MANAGER')")
    public ResponseEntity<ApiResponse<PaymentBatchResponse>> getBatchById(@PathVariable UUID batchId) {
        return ResponseEntity.ok(ApiResponse.success(paymentService.getBatchById(batchId)));
    }

    /**
     * Voids a batch and reverses its FIFO credits.
     * Admin must provide a reason (audit trail). Both COMPLETED and AWAITING_REMITTANCE can be voided.
     */
    @PostMapping("/{batchId}/void")
    @PreAuthorize("hasRole('ROLE_ADMIN')")
    public ResponseEntity<ApiResponse<PaymentBatchResponse>> voidPayment(
            @PathVariable UUID batchId,
            @Valid @RequestBody VoidPaymentRequest request,
            Authentication auth) {
        UUID adminId = (UUID) auth.getPrincipal();
        return ResponseEntity.ok(ApiResponse.success(paymentService.voidPayment(batchId, request, adminId)));
    }

    /**
     * Marks a payment record as DISBURSEMENT_SETTLED — installment withheld from winner's payout.
     * No batch, no treasury movement. Sets amountPaid = amountDue so draw card shows paid.
     */
    @PostMapping("/mark-payout-deducted")
    @PreAuthorize("hasRole('ROLE_ADMIN') or hasRole('ROLE_MANAGER')")
    public ResponseEntity<Void> markPayoutDeducted(
            @Valid @RequestBody MarkPayoutDeductedRequest request) {
        paymentService.markPayoutDeducted(
                request.getChitId(), request.getMemberId(),
                request.getMonthNumber(), request.getPayoutId());
        return ResponseEntity.noContent().build();
    }

    /**
     * Reverts all DISBURSEMENT_SETTLED records linked to a payout back to OUTSTANDING.
     * Called when a payout is cancelled or its draw is deleted.
     */
    @PostMapping("/revert-payout-deductions/{payoutId}")
    @PreAuthorize("hasRole('ROLE_ADMIN') or hasRole('ROLE_MANAGER')")
    public ResponseEntity<Void> revertPayoutDeductions(@PathVariable UUID payoutId) {
        paymentService.revertPayoutDeductions(payoutId);
        return ResponseEntity.noContent().build();
    }

    /**
     * Internal endpoint — called by payout-service during payout creation to atomically
     * mark the winner's installment as DISBURSEMENT_SETTLED without requiring a user JWT.
     */
    @PostMapping("/internal/mark-payout-deducted")
    public ResponseEntity<Void> markPayoutDeductedInternal(
            @Valid @RequestBody MarkPayoutDeductedRequest request,
            @RequestHeader(value = "X-Internal-Key", required = false) String key) {
        if (!internalKey.equals(key)) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        paymentService.markPayoutDeducted(
                request.getChitId(), request.getMemberId(),
                request.getMonthNumber(), request.getPayoutId());
        return ResponseEntity.noContent().build();
    }

    /**
     * Internal endpoint — called by payout-service for cross-chit dues withheld from payout.
     * Applies FIFO across outstanding months of the specified chit, no treasury movement.
     */
    @PostMapping("/internal/mark-cross-chit-disbursement-settled")
    public ResponseEntity<Void> markCrossChitDisbursementSettledInternal(
            @RequestBody Map<String, Object> body,
            @RequestHeader(value = "X-Internal-Key", required = false) String key) {
        if (!internalKey.equals(key)) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        UUID chitId   = UUID.fromString((String) body.get("chitId"));
        UUID memberId = UUID.fromString((String) body.get("memberId"));
        UUID payoutId = UUID.fromString((String) body.get("payoutId"));
        java.math.BigDecimal amount = new java.math.BigDecimal(body.get("amount").toString());
        paymentService.markCrossChitDisbursementSettled(chitId, memberId, amount, payoutId);
        return ResponseEntity.noContent().build();
    }
}
