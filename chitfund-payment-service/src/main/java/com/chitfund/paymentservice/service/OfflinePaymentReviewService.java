package com.chitfund.paymentservice.service;

import com.chitfund.common.context.TenantContext;
import com.chitfund.common.exception.*;
import com.chitfund.paymentservice.client.AuditClient;
import com.chitfund.paymentservice.domain.OfflinePaymentReview;
import com.chitfund.paymentservice.domain.enums.BatchStatus;
import com.chitfund.paymentservice.dto.request.*;
import com.chitfund.paymentservice.repository.*;
import com.chitfund.paymentservice.exception.OfflineReviewRequiredException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.*;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.Instant;
import java.util.*;

@Service @RequiredArgsConstructor
public class OfflinePaymentReviewService {
    private final OfflinePaymentReviewRepository reviews;
    private final PaymentBatchRepository batches;
    private final PaymentService payments;
    private final AuditClient audit;
    private final ObjectMapper json;
    private final CashRequestService cash;
    private final CashPaymentRequestRepository cashRequests;

    private final OfflinePaymentReviewCapture capture;

    public UUID preserveLegacy(RecordPaymentRequest request, UUID actor, String operationId) {
        if (request.getOfflineAuthorization() != null || operationId == null || operationId.isBlank() || operationId.length() > 128
                || request.getAmount().signum() <= 0 || request.getPaymentMode() == com.chitfund.paymentservice.domain.enums.PaymentMode.CREDIT) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED, "Include a valid original collection for legacy review");
        }
        if (request.getPaymentReference() != null) request.setPaymentReference(request.getPaymentReference().trim().toUpperCase(java.util.Locale.ROOT));
        return capture.preserve(request, actor, operationId, "LEGACY_UNVERIFIED");
    }

    private OfflinePaymentReview find(UUID id, boolean lock) {
        return (lock ? reviews.lock(id, TenantContext.get()) : reviews.findByIdAndTenantId(id, TenantContext.get()))
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND, "Saved collection review was not found"));
    }
    private RecordPaymentRequest original(OfflinePaymentReview review) {
        try { return json.readValue(review.getRequestJson(), RecordPaymentRequest.class); }
        catch (Exception invalid) { throw new IllegalStateException("Original collection needs recovery; its record is preserved"); }
    }
    private Map<String, Object> summary(OfflinePaymentReview review) {
        var request = original(review);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("id", review.getId()); result.put("operationId", review.getOperationId());
        result.put("memberId", request.getMemberId()); result.put("chitId", request.getChitId());
        result.put("amount", request.getAmount()); result.put("paymentMode", request.getPaymentMode());
        result.put("paymentReference", request.getPaymentReference()); result.put("recordedAt", request.getRecordedAt());
        result.put("recordedBy", review.getActorId()); result.put("submittedAt", review.getSubmittedAt());
        result.put("status", review.getStatus()); result.put("reviewReason", review.getReason());
        result.put("receiptId", review.getReceiptId()); result.put("resolutionReason", review.getResolutionReason());
        result.put("resolvedBy", review.getResolvedBy()); result.put("resolvedAt", review.getResolvedAt());
        result.put("cashRequestId", review.getCashRequestId());
        return result; // Historical signing evidence never leaves the server API.
    }
    @Transactional(readOnly = true)
    public Page<Map<String, Object>> list(int page, int size) {
        return reviews.findByTenantIdAndStatus(TenantContext.get(), "PENDING",
                PageRequest.of(Math.max(0, page), Math.max(1, Math.min(50, size)), Sort.by("submittedAt"))).map(this::summary);
    }
    @Transactional(readOnly = true)
    public Map<String, Object> detail(UUID id) {
        var review = find(id, false); var request = original(review);
        var result = summary(review);
        result.put("balance", payments.offlineBalanceSnapshot(request, false));
        result.put("originalAllocations", request.getAllocations());
        result.put("recentPayments", payments.getAllBatchesPaged(request.getChitId(), request.getMemberId(), null, null, 0, 10).getContent());
        result.put("possibleMatches", matchesFor(request, 0, 10));
        return result;
    }
    public record Candidate(UUID id, UUID memberId, UUID chitId, java.math.BigDecimal totalAmount,
            com.chitfund.paymentservice.domain.enums.PaymentMode paymentMode, BatchStatus status,
            Instant recordedAt, java.time.LocalDateTime createdAt, String paymentReference) { }

    private Page<Candidate> matchesFor(RecordPaymentRequest request, int page, int size) {
        // Unsigned older records may have no trustworthy original clock. Show
        // all matches for them, rather than guessing a ten-minute arrival window.
        Instant since = request.getRecordedAt() == null ? Instant.parse("1970-01-01T00:00:00Z")
                : request.getRecordedAt().minus(java.time.Duration.ofMinutes(10));
        return batches.findPossibleOfflineDuplicates(TenantContext.get(), request.getMemberId(), request.getChitId(),
                request.getAmount(), since, java.time.LocalDateTime.ofInstant(since, java.time.ZoneOffset.UTC),
                PageRequest.of(Math.max(0, page), Math.max(1, Math.min(50, size)))).map(batch -> new Candidate(batch.getId(),
                    batch.getMemberId(), batch.getChitId(), batch.getTotalAmount(), batch.getPaymentMode(), batch.getStatus(),
                    batch.getRecordedAt(), batch.getCreatedAt(), batch.getPaymentReference()));
    }
    @Transactional(readOnly = true)
    public Page<Candidate> matches(UUID id, int page, int size) { return matchesFor(original(find(id, false)), page, size); }
    @Transactional
    public Map<String, Object> resolve(UUID id, ResolveOfflinePaymentReviewRequest decision, UUID reviewer) {
        if (decision.reason() == null || decision.reason().trim().length() < 5
                || ("LINK_DUPLICATE".equals(decision.decision()) && decision.existingReceiptId() == null)) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED, "Include a review reason and the original receipt when linking a duplicate");
        }
        var review = find(id, true);
        String status = "LINK_DUPLICATE".equals(decision.decision()) ? "DUPLICATE" : "APPLIED";
        if (!List.of("LINK_DUPLICATE", "APPLY_WITH_EXCESS").contains(decision.decision())) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED, "Choose a review decision");
        }
        if (!"PENDING".equals(review.getStatus())) {
            if (!status.equals(review.getStatus()) || !decision.reason().trim().equals(review.getResolutionReason())
                    || ("DUPLICATE".equals(status) && !Objects.equals(decision.existingReceiptId(), review.getReceiptId()))) {
                throw new BusinessException(ErrorCode.CONCURRENT_MODIFICATION, "This collection was already reviewed differently", HttpStatus.CONFLICT);
            }
            return summary(review); // Lost acknowledgement: no second posting/audit.
        }
        var request = original(review);
        if (review.getCashRequestId() != null) cashRequests.findByIdAndTenantIdForUpdate(review.getCashRequestId(), TenantContext.get())
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND, "Original pickup was not found"));
        var snapshot = payments.offlineBalanceSnapshot(request, true);
        if (!snapshot.version().equals(decision.expectedBalanceVersion())) {
            throw new BusinessException(ErrorCode.CONCURRENT_MODIFICATION,
                    "Member balances changed during review. Refresh the figures and review again.", HttpStatus.CONFLICT);
        }
        UUID receiptId;
        if ("DUPLICATE".equals(status)) {
            var receipt = batches.findByIdAndTenantIdForUpdate(decision.existingReceiptId(), TenantContext.get())
                    .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND, "Original payment receipt was not found"));
            if (receipt.getStatus() != BatchStatus.COMPLETED || !receipt.getMemberId().equals(request.getMemberId())
                    || receipt.getTotalAmount().compareTo(request.getAmount()) != 0 || receipt.getPaymentMode() != request.getPaymentMode()
                    || (request.getPaymentReference() != null && !request.getPaymentReference().equals(receipt.getPaymentReference()))) {
                throw new BusinessException(ErrorCode.VALIDATION_FAILED, "That receipt does not match this saved collection");
            }
            receiptId = receipt.getId();
            if (review.getCashRequestId() != null) cash.linkDuplicatePickup(review.getCashRequestId(), request.getAmount(), reviewer, receiptId, decision.reason().trim());
        } else {
            if (review.getCashRequestId() != null) receiptId = cash.collectReviewedPickup(review.getCashRequestId(), reviewer, request.getAmount(), snapshot.version()).getId();
            else if ("LEGACY_UNVERIFIED".equals(review.getReason())) receiptId = payments.recordReviewedLegacyPayment(request,
                    review.getActorId(), review.getOperationId(), snapshot.version()).getId();
            else receiptId = payments.recordReviewedOfflinePayment(request, review.getActorId(), review.getOperationId(), snapshot.version()).getId();
        }
        review.setStatus(status); review.setReceiptId(receiptId); review.setResolvedBy(reviewer);
        review.setResolvedAt(Instant.now()); review.setResolutionReason(decision.reason().trim());
        reviews.saveAndFlush(review);
        audit.log(AuditClient.AuditDetails.builder().entityType("PAYMENT_REVIEW").entityId(id.toString())
                .tenantId(TenantContext.get()).actorId(reviewer.toString()).actorRole("ADMIN")
                .action("OFFLINE_PAYMENT_REVIEW_RESOLVED").idempotencyKey(review.getOperationId())
                .originalOfflineAt(request.getRecordedAt()).synchronizedAt(review.getResolvedAt())
                .metadata(Map.of("decision", decision.decision(), "reason", review.getResolutionReason(),
                        "receiptId", receiptId.toString(), "originalActor", review.getActorId().toString())).build());
        return summary(review);
    }
}
