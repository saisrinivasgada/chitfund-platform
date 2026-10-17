package com.chitfund.paymentservice.service;

import com.chitfund.common.context.TenantContext;
import com.chitfund.common.exception.*;
import com.chitfund.common.offline.OfflineReconciliationRequest;
import com.chitfund.paymentservice.client.*;
import com.chitfund.paymentservice.domain.*;
import com.chitfund.paymentservice.domain.enums.CashRequestStatus;
import com.chitfund.paymentservice.dto.request.*;
import com.chitfund.paymentservice.repository.*;
import com.fasterxml.jackson.databind.*;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.*;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.math.BigDecimal;
import java.time.*;
import java.util.*;

/** Review records cash custody only. Member credit still requires normal remittance. */
@Service @RequiredArgsConstructor
public class OfflineStaffReviewService {
    private final OfflineStaffReviewRepository reviews;
    private final OfflineCommandReceiptRepository receipts;
    private final CashPaymentRequestRepository requests;
    private final CashRequestService cash;
    private final UserServiceClient users;
    private final FinancialCommandLock locks;
    private final AuditClient audit;
    private final ObjectMapper json;
    private final jakarta.persistence.EntityManager entityManager;

    static String lockKey(UUID actor, String operation) { return "STAFF:" + IdempotencyFingerprint.of(actor, operation); }
    static String fingerprint(OfflineStaffActionRequest c, String grant) {
        // Retain the original receipt fingerprint across client upgrades.
        return IdempotencyFingerprint.of(c.getRequestId(), c.getAction(), c.getCollectedAmount(),
                c.getExpectedUpdatedAt(), c.getRecordedAt(), grant);
    }
    static void retainOriginalPickupTime(CashPaymentRequest request, OfflineStaffActionRequest c,
            com.chitfund.paymentservice.dto.response.CashRequestResponse response) {
        var originalTime = LocalDateTime.ofInstant(c.getRecordedAt(), ZoneOffset.UTC);
        request.setPickedUpAt(originalTime); response.setPickedUpAt(originalTime);
        if ("PARTIAL_COLLECT".equals(c.getAction())) {
            request.setPartiallyCollectedAt(originalTime); response.setPartiallyCollectedAt(originalTime);
        }
    }
    private String snapshotFingerprint(OfflineStaffActionRequest c) {
        var s = c.getCollectionSnapshot();
        return s == null ? "MISSING" : IdempotencyFingerprint.of(s.memberId(), s.chitId(), s.requestedAmount());
    }
    private void reviewer(UUID actor) {
        users.verifyOfflineReviewer(new OfflineReconciliationRequest(actor.toString(), TenantContext.get(), "ADMIN", null, null, null));
    }
    private String verify(OfflineStaffActionRequest c, UUID actor, String role) {
        if (!("STAFF".equals(role) || "MANAGER".equals(role)) || c.getOperationId() == null || c.getOperationId().isBlank()
                || c.getOperationId().length() > 128 || c.getRequestId() == null || c.getRecordedAt() == null
                || c.getExpectedUpdatedAt() == null || !("MARK_PICKUP".equals(c.getAction()) || "PARTIAL_COLLECT".equals(c.getAction()))
                || ("PARTIAL_COLLECT".equals(c.getAction()) && (c.getCollectedAmount() == null || c.getCollectedAmount().signum() <= 0))) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED, "Include the original signed pickup details");
        }
        String grant = users.verifyOfflineHistoricalEvidence(new OfflineReconciliationRequest(actor.toString(), TenantContext.get(),
                role, c.getAction(), c.getOfflineAuthorization(), c.getRecordedAt()));
        if (grant == null || grant.isBlank()) throw new BusinessException(ErrorCode.FORBIDDEN, "Original pickup authority could not be verified", HttpStatus.FORBIDDEN);
        return grant;
    }
    @Transactional
    public UUID preserve(OfflineStaffActionRequest c, UUID actor, String role, UUID admin) {
        if (admin != null) reviewer(admin);
        String grant = verify(c, actor, role), hash = fingerprint(c, grant);
        locks.lock(TenantContext.get(), lockKey(actor, c.getOperationId()));
        var existing = reviews.findByTenantIdAndActorIdAndOperationId(TenantContext.get(), actor, c.getOperationId());
        if (existing.isPresent()) {
            var old = existing.get();
            if (!hash.equals(old.getPayloadHash()) || !role.equals(old.getActorRole())
                    || !snapshotFingerprint(original(old)).equals(snapshotFingerprint(c))) throw conflict("Saved pickup identity has different details. Its original evidence is preserved.");
            return old.getId();
        }
        var prior = receipts.findByTenantIdAndActorIdAndOperationId(TenantContext.get(), actor, c.getOperationId());
        if (prior.isPresent() && !hash.equals(prior.get().getPayloadHash())) throw conflict("Saved pickup identity belongs to different details");
        var review = OfflineStaffReview.builder().id(UUID.randomUUID()).tenantId(TenantContext.get()).actorId(actor).actorRole(role)
                .operationId(c.getOperationId()).requestId(c.getRequestId()).payloadHash(hash).requestJson(write(c))
                .status(prior.isPresent() ? "LINKED" : "PENDING").submittedAt(Instant.now()).build();
        // A lost acknowledgement is an existing outcome, never another pickup.
        if (prior.isPresent()) {
            review.setResolutionJson(prior.get().getResponseJson()); review.setResolvedAt(Instant.now());
            review.setResolutionReason("Original server receipt recovered");
        }
        reviews.saveAndFlush(review);
        log(review, admin == null ? actor : admin, admin == null ? role : "ADMIN", "OFFLINE_PICKUP_PRESERVED");
        return review.getId();
    }
    private OfflineStaffReview find(UUID id) {
        return reviews.findByIdAndTenantId(id, TenantContext.get()).orElseThrow(() -> new ResourceNotFoundException("Pickup review", id));
    }
    private OfflineStaffActionRequest original(OfflineStaffReview r) {
        try { return json.readValue(r.getRequestJson(), OfflineStaffActionRequest.class); }
        catch (Exception e) { throw new IllegalStateException("Original pickup needs recovery; its evidence remains preserved", e); }
    }
    private String write(Object value) {
        try { return json.writeValueAsString(value); }
        catch (Exception e) { throw new IllegalStateException("Pickup evidence could not be saved", e); }
    }
    private Object result(OfflineStaffReview r) {
        if (r.getResolutionJson() == null) return null;
        try { return json.readTree(r.getResolutionJson()); }
        catch (Exception e) { throw new IllegalStateException("Pickup decision needs recovery", e); }
    }
    private String version(CashPaymentRequest r) {
        return r == null ? "MISSING" : IdempotencyFingerprint.of(r.getId(), r.getMemberId(), r.getChitId(), r.getStatus(),
                r.getRequestedAmount(), r.getCollectedAmount(), r.getAssignedStaffId(), r.getPickedUpBy(),
                r.getMemberApproved(), r.getCollectedBatchId(), r.getUpdatedAt());
    }
    private Map<String, Object> summary(OfflineStaffReview r) {
        var c = original(r); var s = c.getCollectionSnapshot();
        var v = new LinkedHashMap<String,Object>();
        v.put("id", r.getId()); v.put("kind", "STAFF_PICKUP"); v.put("status", r.getStatus()); v.put("requestId", r.getRequestId());
        v.put("operationId", r.getOperationId()); v.put("recordedBy", r.getActorId()); v.put("originalRole", r.getActorRole());
        v.put("action", c.getAction()); v.put("recordedAt", c.getRecordedAt());
        v.put("memberId", s == null ? null : s.memberId()); v.put("chitId", s == null ? null : s.chitId());
        v.put("amount", "PARTIAL_COLLECT".equals(c.getAction()) ? c.getCollectedAmount() : s == null || s.requestedAmount() == null || s.requestedAmount().signum() <= 0 ? null : s.requestedAmount());
        v.put("resolutionReason", r.getResolutionReason()); v.put("resolvedAt", r.getResolvedAt()); v.put("result", result(r));
        return v; // Never return the signing proof or stored command JSON.
    }
    @Transactional(readOnly = true)
    public Page<Map<String,Object>> list(UUID admin, int page, int size) {
        reviewer(admin);
        return reviews.findByTenantIdAndStatus(TenantContext.get(), "PENDING", PageRequest.of(Math.max(0,page), Math.max(1,Math.min(50,size)), Sort.by("submittedAt"))).map(this::summary);
    }
    @Transactional(readOnly = true)
    public Map<String,Object> detail(UUID id, UUID actor, boolean admin) {
        if (admin) reviewer(actor);
        var r = find(id);
        if (!admin && !actor.equals(r.getActorId())) throw new BusinessException(ErrorCode.FORBIDDEN, "This pickup belongs to another account", HttpStatus.FORBIDDEN);
        var v = summary(r);
        if (admin) {
            String name = users.getUserName(r.getActorId());
            v.put("collectorName", name == null || name.isBlank() ? "Name unavailable" : name);
            var current = requests.findByIdAndTenantId(r.getRequestId(), TenantContext.get()).orElse(null);
            v.put("version", version(current));
            if (current != null) v.put("current", Map.of("status", current.getStatus(), "updatedAt", current.getUpdatedAt(),
                    "memberId", current.getMemberId(), "chitId", current.getChitId(),
                    "requestedAmount", current.getRequestedAmount() == null ? "Unknown" : current.getRequestedAmount(),
                    "assignedToOriginalCollector", r.getActorId().equals(current.getAssignedStaffId()),
                    "pickedUpByOriginalCollector", r.getActorId().equals(current.getPickedUpBy())));
        }
        return v;
    }
    @Transactional
    public Map<String,Object> resolve(UUID id, ResolveOfflineStaffReviewRequest d, UUID admin) {
        reviewer(admin);
        var r = find(id);
        locks.lock(TenantContext.get(), lockKey(r.getActorId(), r.getOperationId()));
        // Refresh after acquiring the command mutex: another reviewer may have finished.
        entityManager.refresh(r, jakarta.persistence.LockModeType.PESSIMISTIC_WRITE);
        if (!d.confirmed() || d.reason() == null || d.reason().trim().length() < 5 || d.reason().length() > 500)
            throw new BusinessException(ErrorCode.VALIDATION_FAILED, "Confirm the verified outcome and explain your decision");
        if (!"PENDING".equals(r.getStatus())) {
            var saved = json.valueToTree(result(r));
            try { if (Objects.equals(saved.path("decision"), json.readTree(write(d)))) return summary(r); }
            catch (com.fasterxml.jackson.core.JsonProcessingException invalid) { throw new IllegalStateException("Pickup decision needs recovery", invalid); }
            throw conflict("This pickup was already reviewed. Refresh its recorded outcome.");
        }
        var c = original(r);
        String grant = verify(c, r.getActorId(), r.getActorRole());
        var request = requests.findByIdAndTenantIdForUpdate(r.getRequestId(), TenantContext.get()).orElse(null);
        if (!Objects.equals(version(request), d.expectedVersion())) throw conflict("Pickup changed during review. Refresh and review the latest details.");
        if (receipts.findByTenantIdAndActorIdAndOperationId(TenantContext.get(), r.getActorId(), r.getOperationId()).isPresent())
            throw conflict("The original pickup already has a server receipt. Recover its outcome before reviewing.");
        BigDecimal known = "PARTIAL_COLLECT".equals(c.getAction()) ? c.getCollectedAmount()
                : c.getCollectionSnapshot() == null || c.getCollectionSnapshot().requestedAmount() == null || c.getCollectionSnapshot().requestedAmount().signum() <= 0 ? null : c.getCollectionSnapshot().requestedAmount();
        boolean custody = request != null && r.getActorId().equals(request.getPickedUpBy())
                && List.of(CashRequestStatus.PICKED_UP, CashRequestStatus.PARTIALLY_COLLECTED, CashRequestStatus.COLLECTED).contains(request.getStatus());
        Object outcome;
        switch (d.decision()) {
            case "RECORD_CUSTODY", "LINK_CUSTODY" -> {
                if (d.actualAmount() == null || d.actualAmount().signum() <= 0 || (known != null && known.compareTo(d.actualAmount()) != 0))
                    throw new BusinessException(ErrorCode.VALIDATION_FAILED, "Use the actual original collected amount; it cannot be changed during review");
                var snapshot = c.getCollectionSnapshot();
                if (request == null || snapshot == null || !Objects.equals(snapshot.memberId(), request.getMemberId()) || !Objects.equals(snapshot.chitId(), request.getChitId()))
                    throw conflict("Verify the original member and chit before recording custody. The pickup remains held for review.");
                if ("LINK_CUSTODY".equals(d.decision())) {
                    BigDecimal amount = request.getCollectedAmount() != null ? request.getCollectedAmount() : request.getRequestedAmount();
                    if (!custody || amount == null || amount.compareTo(d.actualAmount()) != 0) throw conflict("Current custody does not match the original collector and amount");
                    // An explicit admin decision confirms the same physical collection.
                    outcome = Map.of("id", request.getId(), "status", request.getStatus(), "offlineReviewResolution", "LINKED");
                    r.setStatus("LINKED");
                } else {
                    if (request.getStatus() != CashRequestStatus.ASSIGNED || !r.getActorId().equals(request.getAssignedStaffId()))
                        throw conflict("Restore assignment to the original collector in Cash Pickups before recording this custody. No request has been overwritten.");
                    if ("MARK_PICKUP".equals(c.getAction())) {
                        if (request.getRequestedAmount() != null && request.getRequestedAmount().compareTo(d.actualAmount()) != 0)
                            throw conflict("Requested amount changed. Verify and restore the original task amount first.");
                        if (request.getRequestedAmount() == null) { request.setRequestedAmount(d.actualAmount()); requests.saveAndFlush(request); }
                        outcome = cash.markPickedUp(request.getId(), r.getActorId(), r.getActorRole());
                    } else outcome = cash.partiallyCollect(request.getId(), d.actualAmount(), r.getActorId(), r.getActorRole());
                    var response = (com.chitfund.paymentservice.dto.response.CashRequestResponse) outcome;
                    retainOriginalPickupTime(request, c, response); requests.saveAndFlush(request); response.setUpdatedAt(request.getUpdatedAt());
                    r.setStatus("RECORDED");
                }
                receipts.saveAndFlush(OfflineCommandReceipt.builder().id(UUID.randomUUID()).tenantId(TenantContext.get()).actorId(r.getActorId())
                        .operationId(r.getOperationId()).requestId(r.getRequestId()).action(c.getAction()).payloadHash(r.getPayloadHash()).grantId(grant)
                        .recordedAt(c.getRecordedAt()).synchronizedAt(Instant.now()).responseJson(write(outcome)).build());
            }
            case "CANCEL_MISTAKE" -> {
                if (custody) throw conflict("Cash custody already exists. Reconcile that pickup instead of cancelling it as uncollected.");
                r.setStatus("CANCELLED"); outcome = d;
            }
            case "RECORD_REFUND" -> {
                if (custody) throw conflict("Cash custody already exists. Use its normal reconciliation workflow before recording a refund here.");
                if (d.actualAmount() == null || d.actualAmount().signum() <= 0 || (known != null && known.compareTo(d.actualAmount()) != 0)
                        || !List.of("CASH", "UPI", "BANK_TRANSFER", "CHEQUE").contains(d.paymentMode() == null ? "" : d.paymentMode())
                        || d.reference() == null || d.reference().trim().length() < 3 || d.refundedAt() == null
                        || d.refundedAt().isBefore(c.getRecordedAt()) || d.refundedAt().isAfter(Instant.now().plusSeconds(300)))
                    throw new BusinessException(ErrorCode.VALIDATION_FAILED, "Include the full returned amount and actual refund method, reference and date");
                r.setStatus("REFUNDED"); outcome = d;
            }
            default -> throw new BusinessException(ErrorCode.VALIDATION_FAILED, "Choose a pickup review decision");
        }
        // Closing a mistaken/refunded entry must not reserve this unchanged task
        // forever under the old client operation key. A later real collection
        // starts from a freshly downloaded version; the original key stays closed.
        var snapshot = c.getCollectionSnapshot();
        if (List.of("CANCELLED", "REFUNDED").contains(r.getStatus()) && request != null && snapshot != null
                && request.getStatus() == CashRequestStatus.ASSIGNED && r.getActorId().equals(request.getAssignedStaffId())
                && Objects.equals(snapshot.memberId(), request.getMemberId()) && Objects.equals(snapshot.chitId(), request.getChitId())) {
            request.setUpdatedAt(LocalDateTime.now()); requests.saveAndFlush(request);
        }
        r.setResolvedBy(admin); r.setResolvedAt(Instant.now()); r.setResolutionReason(d.reason().trim());
        // Store both the decision identity and resulting custody separately.
        r.setResolutionJson(write(Map.of("decision", d, "outcome", outcome)));
        reviews.saveAndFlush(r); log(r, admin, "ADMIN", "OFFLINE_PICKUP_" + r.getStatus());
        return summary(r);
    }
    private void log(OfflineStaffReview r, UUID actor, String role, String action) {
        audit.log(AuditClient.AuditDetails.builder().entityType("CASH_REQUEST_REVIEW").entityId(r.getId().toString())
                .tenantId(TenantContext.get()).actorId(actor.toString()).actorRole(role).action(action)
                .idempotencyKey(r.getOperationId()).originalOfflineAt(original(r).getRecordedAt()).synchronizedAt(Instant.now())
                .metadata(Map.of("originalActor", r.getActorId().toString(), "requestId", r.getRequestId().toString(), "status", r.getStatus(),
                        "reason", r.getResolutionReason() == null ? "Changed pickup or account access" : r.getResolutionReason())).build());
    }
    private BusinessException conflict(String message) { return new BusinessException(ErrorCode.CONCURRENT_MODIFICATION, message, HttpStatus.CONFLICT); }
}
