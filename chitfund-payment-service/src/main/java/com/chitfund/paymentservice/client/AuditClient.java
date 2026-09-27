package com.chitfund.paymentservice.client;

import com.chitfund.common.event.AuditLogEvent;
import com.chitfund.common.event.SqsQueues;
import com.chitfund.paymentservice.kafka.PaymentOutboxStore;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.util.List;
import java.util.UUID;

@Component
@RequiredArgsConstructor
public class AuditClient {

    private final PaymentOutboxStore outboxStore;
    private final ObjectMapper objectMapper;

    public void log(String entityType, String entityId, String chitId,
                    String action, String actorId, String actorRole,
                    Object before, Object after, String tenantId) {
        if (!TransactionSynchronizationManager.isActualTransactionActive()) {
            throw new IllegalStateException(
                    "A payment audit event must be recorded inside the business transaction");
        }
        try {
            AuditLogEvent event = new AuditLogEvent("payment-service", entityType, entityId, chitId,
                    action, actorId, actorRole, null,
                    before != null ? objectMapper.writeValueAsString(before) : null,
                    after != null ? objectMapper.writeValueAsString(after) : null,
                    null, tenantId);
            outboxStore.enqueue(UUID.randomUUID().toString(), tenantId, entityType, entityId,
                    SqsQueues.EVT_AUDIT_LOG, objectMapper.writeValueAsString(event),
                    List.of(SqsQueues.AUDIT_EVENTS));
        } catch (Exception exception) {
            throw new IllegalStateException(
                    "Could not record the payment audit event in the transactional outbox", exception);
        }
    }
}
