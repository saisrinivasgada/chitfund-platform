package com.chitfund.payoutservice.client;

import com.chitfund.common.event.AuditLogEvent;
import com.chitfund.common.event.SqsQueues;
import com.chitfund.common.logging.AuditRequestContext;
import com.chitfund.payoutservice.kafka.PayoutOutboxStore;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.util.List;
import java.util.UUID;
import java.time.Instant;

@Component
@RequiredArgsConstructor
public class AuditClient {

    private final PayoutOutboxStore outboxStore;
    private final ObjectMapper objectMapper;

    public void log(String entityType, String entityId, String chitId,
                    String action, String actorId, String actorRole,
                    Object before, Object after, String tenantId) {
        log(entityType, entityId, chitId, action, actorId, actorRole,
                before, after, tenantId, null);
    }

    public void log(String entityType, String entityId, String chitId,
                    String action, String actorId, String actorRole,
                    Object before, Object after, String tenantId,
                    String idempotencyKey) {
        if (!TransactionSynchronizationManager.isActualTransactionActive()) {
            throw new IllegalStateException(
                    "A payout audit event must be recorded inside the business transaction");
        }
        try {
            AuditRequestContext context = AuditRequestContext.current();
            AuditLogEvent event = new AuditLogEvent("payout-service", entityType, entityId, chitId,
                    action, actorId, actorRole, context.actorIp(),
                    before != null ? objectMapper.writeValueAsString(before) : null,
                    after != null ? objectMapper.writeValueAsString(after) : null,
                    null, tenantId, context.correlationId(),
                    context.idempotencyKeyOr(idempotencyKey), context.source(), "SUCCESS", null,
                    null, null, context.deviceSessionHash(), Instant.now(), null, null);
            outboxStore.enqueue(UUID.randomUUID().toString(), tenantId, entityType, entityId,
                    SqsQueues.EVT_AUDIT_LOG, objectMapper.writeValueAsString(event),
                    List.of(SqsQueues.AUDIT_EVENTS));
        } catch (Exception exception) {
            throw new IllegalStateException(
                    "Could not record the payout audit event in the transactional outbox", exception);
        }
    }
}
