package com.chitfund.paymentservice.service;

import com.chitfund.common.context.TenantContext;
import com.chitfund.common.exception.*;
import com.chitfund.common.offline.OfflineReconciliationRequest;
import com.chitfund.paymentservice.client.AuditClient;
import com.chitfund.paymentservice.client.UserServiceClient;
import com.chitfund.paymentservice.domain.OfflineCommandReceipt;
import com.chitfund.paymentservice.dto.request.OfflineStaffActionRequest;
import com.chitfund.paymentservice.repository.*;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class OfflineStaffActionService {
    private final UserServiceClient users;
    private final CashRequestService cashRequests;
    private final CashPaymentRequestRepository requests;
    private final OfflineCommandReceiptRepository receipts;
    private final ObjectMapper json;
    private final AuditClient audit;

    @Transactional
    public JsonNode apply(OfflineStaffActionRequest command, UUID actorId, String role) {
        String tenantId = TenantContext.get();
        if (tenantId == null || tenantId.isBlank() || !("STAFF".equals(role) || "MANAGER".equals(role))) {
            throw new BusinessException(ErrorCode.FORBIDDEN, "Organisation account is required", HttpStatus.FORBIDDEN);
        }
        if (!("MARK_PICKUP".equals(command.getAction()) || "PARTIAL_COLLECT".equals(command.getAction()))
                || ("PARTIAL_COLLECT".equals(command.getAction())
                    && (command.getCollectedAmount() == null || command.getCollectedAmount().signum() <= 0))) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED, "Enter a valid collection action");
        }
        String grantId = users.verifyOfflineRecordedAction(new OfflineReconciliationRequest(
                actorId.toString(), tenantId, role, command.getAction(),
                command.getOfflineAuthorization(), command.getRecordedAt()));
        if (grantId == null || grantId.isBlank()) throw new BusinessException(ErrorCode.FORBIDDEN,
                "The original collection authorisation could not be verified", HttpStatus.FORBIDDEN);
        String hash = IdempotencyFingerprint.of(command.getRequestId(), command.getAction(),
                command.getCollectedAmount(), command.getExpectedUpdatedAt(), command.getRecordedAt(), grantId);
        // Lock the underlying request to serialize different keys acting on the
        // same collection as well as simultaneous retries of one saved command.
        var request = requests.findByIdAndTenantIdForUpdate(command.getRequestId(), tenantId)
                .orElseThrow(() -> new ResourceNotFoundException("Cash request", command.getRequestId()));
        var prior = receipts.findByTenantIdAndActorIdAndOperationId(tenantId, actorId, command.getOperationId());
        if (prior.isPresent()) {
            if (!hash.equals(prior.get().getPayloadHash())) throw conflict("Saved operation has different collection details");
            try { return json.readTree(prior.get().getResponseJson()); }
            catch (com.fasterxml.jackson.core.JsonProcessingException corrupt) {
                throw new IllegalStateException("Saved collection receipt could not be read", corrupt);
            }
        }
        if (command.getExpectedUpdatedAt() == null || !command.getExpectedUpdatedAt().equals(request.getUpdatedAt())) {
            throw conflict("This pickup changed since it was downloaded. Your saved collection needs review.");
        }
        var response = "MARK_PICKUP".equals(command.getAction())
                ? cashRequests.markPickedUp(command.getRequestId(), actorId, role)
                : cashRequests.partiallyCollect(command.getRequestId(), command.getCollectedAmount(), actorId, role);
        JsonNode body = json.valueToTree(response);
        Instant syncedAt = Instant.now();
        receipts.saveAndFlush(OfflineCommandReceipt.builder().id(UUID.randomUUID()).tenantId(tenantId)
                .actorId(actorId).operationId(command.getOperationId()).requestId(command.getRequestId())
                .action(command.getAction()).payloadHash(hash).grantId(grantId).responseJson(body.toString())
                .recordedAt(command.getRecordedAt()).synchronizedAt(syncedAt).build());
        audit.log(AuditClient.AuditDetails.builder().entityType("CASH_REQUEST")
                .entityId(command.getRequestId().toString()).action("OFFLINE_COLLECTION_SYNCHRONIZED")
                .actorId(actorId.toString()).actorRole(role).tenantId(tenantId)
                .idempotencyKey(command.getOperationId()).originalOfflineAt(command.getRecordedAt())
                .synchronizedAt(syncedAt).metadata(Map.of("offlineGrantId", grantId)).build());
        return body;
    }

    private BusinessException conflict(String message) {
        return new BusinessException(ErrorCode.VALIDATION_FAILED, message, HttpStatus.CONFLICT);
    }
}
