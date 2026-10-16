package com.chitfund.paymentservice.service;

import com.chitfund.common.context.TenantContext;
import com.chitfund.common.exception.*;
import com.chitfund.paymentservice.domain.OfflinePaymentReview;
import com.chitfund.paymentservice.dto.request.RecordPaymentRequest;
import com.chitfund.paymentservice.repository.OfflinePaymentReviewRepository;
import com.chitfund.paymentservice.repository.OfflineCommandReceiptRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import java.time.Instant;
import java.util.UUID;

@Service @RequiredArgsConstructor
public class OfflinePaymentReviewCapture {
    private final OfflinePaymentReviewRepository reviews;
    private final ObjectMapper json;
    private final OfflineCommandReceiptRepository staffReceipts;

    public java.util.Optional<OfflinePaymentReview> findOperation(String operationId) {
        return reviews.findByTenantIdAndOperationId(TenantContext.get(), operationId);
    }

    public void assertMatches(OfflinePaymentReview review, RecordPaymentRequest request, UUID actor) {
        try {
            if (!review.getActorId().equals(actor) || !review.getPayloadHash().equals(IdempotencyFingerprint.of(json.writeValueAsString(request)))) {
                throw new BusinessException(ErrorCode.CONCURRENT_MODIFICATION, "Saved collection identity has different details", HttpStatus.CONFLICT);
            }
        } catch (com.fasterxml.jackson.core.JsonProcessingException invalid) {
            throw new IllegalStateException("Saved collection could not be verified");
        }
    }

    // The payment transaction deliberately rolls back on a conflict. Its review
    // evidence must commit separately, without creating a payment/credit entry.
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public UUID preserve(RecordPaymentRequest request, UUID actor, String operationId, String reason) {
        return preserveInternal(request, actor, operationId, reason, null);
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public UUID preserveCashPickup(RecordPaymentRequest request, UUID actor, UUID requestId) {
        staffReceipts.findFirstByTenantIdAndRequestIdOrderBySynchronizedAtDesc(TenantContext.get(), requestId)
                .ifPresent(receipt -> request.setRecordedAt(receipt.getRecordedAt()));
        return preserveInternal(request, actor, "CASH_REQUEST:" + requestId, "PICKUP_DUES_CHANGED", requestId);
    }

    private UUID preserveInternal(RecordPaymentRequest request, UUID actor, String operationId, String reason, UUID cashRequestId) {
        String tenant = TenantContext.get();
        String payload;
        try { payload = json.writeValueAsString(request); }
        catch (Exception invalid) { throw new IllegalStateException("Saved collection could not be preserved"); }
        String hash = IdempotencyFingerprint.of(payload);
        var existing = reviews.findByTenantIdAndOperationId(tenant, operationId);
        if (existing.isPresent()) {
            if (!existing.get().getActorId().equals(actor) || !existing.get().getPayloadHash().equals(hash)) {
                throw new BusinessException(ErrorCode.CONCURRENT_MODIFICATION, "Saved collection identity has different details", HttpStatus.CONFLICT);
            }
            return existing.get().getId();
        }
        reviews.insertIfAbsent(UUID.randomUUID().toString(), tenant, actor.toString(), operationId, hash, payload,
                reason, java.sql.Timestamp.from(Instant.now()), cashRequestId == null ? null : cashRequestId.toString());
        var review = reviews.findOperationForUpdate(tenant, operationId)
                .orElseThrow(() -> new IllegalStateException("Saved review could not be confirmed"));
        assertMatches(review, request, actor);
        return review.getId();
    }
}
