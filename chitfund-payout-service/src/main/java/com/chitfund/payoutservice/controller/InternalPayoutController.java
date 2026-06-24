package com.chitfund.payoutservice.controller;

import com.chitfund.common.dto.ApiResponse;
import com.chitfund.payoutservice.domain.Payout;
import com.chitfund.payoutservice.domain.enums.PayoutStatus;
import com.chitfund.payoutservice.dto.response.PayoutResponse;
import com.chitfund.payoutservice.repository.PayoutRepository;
import com.chitfund.payoutservice.service.PayoutService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Internal endpoint for cross-service settlement calls.
 * Called by payment-service SettlementService to fetch the relevant payout for a member+chit.
 *
 * Priority order when multiple payouts exist for the same member+chit (multi-spot edge case):
 *  1. DISBURSED
 *  2. PARTIALLY_DISBURSED
 *  3. PENDING
 * CANCELLED and VOIDED are excluded.
 */
@RestController
@RequestMapping("/internal")
@RequiredArgsConstructor
@Slf4j
public class InternalPayoutController {

    private final PayoutRepository payoutRepository;
    private final PayoutService payoutService;

    @Value("${app.internal-key:chitfund-internal-service-key}")
    private String internalKey;

    /**
     * Returns the most relevant payout for a member+chit pair.
     * Returns 204 No Content if no relevant payout exists.
     */
    @GetMapping("/payouts/member/{memberId}/chit/{chitId}")
    public ResponseEntity<?> getPayoutForMemberInChit(
            @PathVariable UUID memberId,
            @PathVariable UUID chitId,
            @RequestHeader(value = "X-Internal-Key", required = false) String key) {

        if (!internalKey.equals(key)) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        // Get all non-cancelled, non-voided payouts for this member in this chit
        List<Payout> payouts = payoutRepository.findByMemberIdOrderByCreatedAtDesc(memberId)
                .stream()
                .filter(p -> chitId.equals(p.getChitId()))
                .filter(p -> p.getStatus() != PayoutStatus.CANCELLED
                          && p.getStatus() != PayoutStatus.VOIDED)
                .toList();

        if (payouts.isEmpty()) {
            log.debug("Internal: no relevant payout for member {} chit {}", memberId, chitId);
            return ResponseEntity.ok(ApiResponse.success(null));
        }

        // Priority: DISBURSED > PARTIALLY_DISBURSED > PENDING
        Optional<Payout> best = payouts.stream()
                .max(Comparator.comparingInt(p -> priorityOf(p.getStatus())));

        if (best.isEmpty()) {
            return ResponseEntity.ok(ApiResponse.success(null));
        }

        PayoutResponse response = payoutService.getById(best.get().getId());
        log.debug("Internal: returning payout {} (status={}) for member {} chit {}",
                best.get().getId(), best.get().getStatus(), memberId, chitId);

        return ResponseEntity.ok(ApiResponse.success(response));
    }

    private int priorityOf(PayoutStatus status) {
        return switch (status) {
            case DISBURSED -> 3;
            case PARTIALLY_DISBURSED -> 2;
            case PENDING -> 1;
            default -> 0;
        };
    }
}
