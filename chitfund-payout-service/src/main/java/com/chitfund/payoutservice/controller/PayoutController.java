package com.chitfund.payoutservice.controller;

import com.chitfund.common.context.MemberContext;
import com.chitfund.common.dto.ApiResponse;
import com.chitfund.common.exception.BusinessException;
import com.chitfund.common.exception.ErrorCode;
import com.chitfund.payoutservice.dto.request.CancelPayoutRequest;
import com.chitfund.payoutservice.dto.request.CreatePayoutRequest;
import com.chitfund.payoutservice.dto.request.DisburseRequest;
import com.chitfund.payoutservice.dto.response.PayoutResponse;
import com.chitfund.payoutservice.service.PayoutService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/payouts")
@RequiredArgsConstructor
public class PayoutController {

    private final PayoutService payoutService;

    /**
     * Admin registers a payout after announcing the month's winner.
     * This is the bridge between chit-service (winner selection) and payout-service (money movement).
     * In the future this will be triggered automatically by a Kafka WinnerSelectedEvent.
     */
    @PostMapping
    @PreAuthorize("hasRole('ROLE_ADMIN') or hasRole('ROLE_MANAGER')")
    public ResponseEntity<ApiResponse<PayoutResponse>> createPayout(
            @Valid @RequestBody CreatePayoutRequest request,
            Authentication auth) {
        UUID adminId = (UUID) auth.getPrincipal();
        String role = auth.getAuthorities().stream().findFirst()
                .map(a -> a.getAuthority().replace("ROLE_", "")).orElse("ADMIN");
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success(payoutService.createPayout(request, adminId, role)));
    }

    /**
     * Admin dashboard view: all payouts waiting to be disbursed.
     * This is the primary list admin checks daily — "who still needs to be paid?"
     */
    @GetMapping("/pending")
    @PreAuthorize("hasRole('ROLE_ADMIN') or hasRole('ROLE_MANAGER')")
    public ResponseEntity<ApiResponse<List<PayoutResponse>>> getPendingPayouts() {
        return ResponseEntity.ok(ApiResponse.success(payoutService.getPendingPayouts()));
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasRole('ROLE_ADMIN') or hasRole('ROLE_MEMBER')")
    public ResponseEntity<ApiResponse<PayoutResponse>> getPayout(@PathVariable UUID id) {
        return ResponseEntity.ok(ApiResponse.success(payoutService.getById(id)));
    }

    /**
     * Full payout history for a chit — months 1 through N.
     * Useful for: "Which months have been paid? Which are still pending?"
     */
    @GetMapping("/chit/{chitId}")
    @PreAuthorize("hasRole('ROLE_ADMIN')")
    public ResponseEntity<ApiResponse<List<PayoutResponse>>> getPayoutsForChit(
            @PathVariable UUID chitId) {
        return ResponseEntity.ok(ApiResponse.success(payoutService.getPayoutsForChit(chitId)));
    }

    /**
     * A member's full winning history across all chits.
     * Useful for: tax records, dispute resolution, member profile.
     */
    @GetMapping("/member/{memberId}")
    @PreAuthorize("hasRole('ROLE_ADMIN') or hasRole('ROLE_MEMBER')")
    public ResponseEntity<ApiResponse<List<PayoutResponse>>> getPayoutsForMember(
            @PathVariable UUID memberId, Authentication auth) {
        boolean isMember = auth.getAuthorities().stream()
                .anyMatch(a -> a.getAuthority().equals("ROLE_MEMBER"));
        if (isMember && !memberId.toString().equals(MemberContext.get())) {
            throw new BusinessException(ErrorCode.FORBIDDEN, "Access denied");
        }
        return ResponseEntity.ok(ApiResponse.success(payoutService.getPayoutsForMember(memberId)));
    }

    /**
     * Admin records the actual disbursement — money is now with the winner.
     * Transitions PENDING → DISBURSED.
     * Non-CASH modes require a reference number (UTR / UPI ID / cheque no.) for audit.
     */
    @PostMapping("/{id}/disburse")
    @PreAuthorize("hasRole('ROLE_ADMIN')")
    public ResponseEntity<ApiResponse<PayoutResponse>> disburse(
            @PathVariable UUID id,
            @Valid @RequestBody DisburseRequest request,
            Authentication auth) {
        UUID adminId = (UUID) auth.getPrincipal();
        return ResponseEntity.ok(ApiResponse.success(payoutService.disburse(id, request, adminId)));
    }

    /** All payouts across all chits, with optional date range and chit filter — for reports. */
    @GetMapping("/all")
    @PreAuthorize("hasRole('ROLE_ADMIN') or hasRole('ROLE_MANAGER')")
    public ResponseEntity<ApiResponse<List<PayoutResponse>>> getAllPayouts(
            @RequestParam(required = false) UUID chitId,
            @RequestParam(required = false) LocalDate fromDate,
            @RequestParam(required = false) LocalDate toDate) {
        return ResponseEntity.ok(ApiResponse.success(payoutService.getAllPayouts(chitId, fromDate, toDate)));
    }

    /** All payouts created or disbursed today — used in the daily activity feed. */
    @GetMapping("/today")
    @PreAuthorize("hasRole('ROLE_ADMIN') or hasRole('ROLE_MANAGER')")
    public ResponseEntity<ApiResponse<List<PayoutResponse>>> getTodaysPayouts() {
        return ResponseEntity.ok(ApiResponse.success(payoutService.getTodaysPayouts()));
    }

    /**
     * Void any payout regardless of status. Used when a disbursement needs to be reversed.
     * Sets status to VOIDED, freeing the draw slot for a new payout to be created.
     * Treasury payment batches created during settlement must be voided separately via payment-service.
     */
    @PostMapping("/{id}/void")
    @PreAuthorize("hasRole('ROLE_ADMIN')")
    public ResponseEntity<ApiResponse<PayoutResponse>> voidPayout(
            @PathVariable UUID id,
            @Valid @RequestBody CancelPayoutRequest request,
            Authentication auth) {
        UUID adminId = (UUID) auth.getPrincipal();
        return ResponseEntity.ok(ApiResponse.success(payoutService.voidPayout(id, request, adminId)));
    }

    /**
     * Cancel a PENDING payout. Requires a reason — appended to the audit trail.
     * Cannot cancel a payout that has already been disbursed.
     */
    @PostMapping("/{id}/cancel")
    @PreAuthorize("hasRole('ROLE_ADMIN')")
    public ResponseEntity<ApiResponse<PayoutResponse>> cancel(
            @PathVariable UUID id,
            @Valid @RequestBody CancelPayoutRequest request,
            Authentication auth) {
        UUID adminId = (UUID) auth.getPrincipal();
        return ResponseEntity.ok(ApiResponse.success(payoutService.cancel(id, request, adminId)));
    }
}
