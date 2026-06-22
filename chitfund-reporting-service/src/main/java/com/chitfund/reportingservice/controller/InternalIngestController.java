package com.chitfund.reportingservice.controller;

import com.chitfund.common.dto.ApiResponse;
import com.chitfund.reportingservice.dto.ingest.CollectionSnapshotEvent;
import com.chitfund.reportingservice.dto.ingest.MemberPaymentEvent;
import com.chitfund.reportingservice.dto.ingest.PayoutEvent;
import com.chitfund.reportingservice.service.ReportIngestService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/**
 * Called by payment-service and payout-service to push read-model updates.
 *
 * WHY not JWT here?
 * Services calling this endpoint are not users — they have no JWT.
 * In production this URL is inside a private VPC (not routed through the API gateway).
 * X-Internal-Key is a defense-in-depth check: even if the endpoint is misconfigured
 * and accidentally exposed, callers without the shared key are rejected.
 *
 * WHY "full snapshot" pattern?
 * Idempotent: the same event can be replayed any number of times safely.
 * Ordering doesn't matter: a late snapshot just overwrites with the same data.
 * This makes retry logic trivial for callers.
 */
@RestController
@RequestMapping("/internal")
@RequiredArgsConstructor
public class InternalIngestController {

    private final ReportIngestService ingestService;

    @Value("${reporting.internal-key}")
    private String internalKey;

    @PostMapping("/ingest/collection-snapshot")
    public ResponseEntity<ApiResponse<Void>> ingestCollectionSnapshot(
            @RequestHeader("X-Internal-Key") String key,
            @Valid @RequestBody CollectionSnapshotEvent event) {

        validateKey(key);
        ingestService.ingestCollectionSnapshot(event);
        return ResponseEntity.ok(ApiResponse.success(null));
    }

    @PostMapping("/ingest/member-payment")
    public ResponseEntity<ApiResponse<Void>> ingestMemberPayment(
            @RequestHeader("X-Internal-Key") String key,
            @Valid @RequestBody MemberPaymentEvent event) {

        validateKey(key);
        ingestService.ingestMemberPayment(event);
        return ResponseEntity.ok(ApiResponse.success(null));
    }

    @PostMapping("/ingest/payout")
    public ResponseEntity<ApiResponse<Void>> ingestPayout(
            @RequestHeader("X-Internal-Key") String key,
            @Valid @RequestBody PayoutEvent event) {

        validateKey(key);
        ingestService.ingestPayout(event);
        return ResponseEntity.ok(ApiResponse.success(null));
    }

    private void validateKey(String provided) {
        if (!internalKey.equals(provided)) {
            throw new org.springframework.security.access.AccessDeniedException("Invalid internal key");
        }
    }
}
