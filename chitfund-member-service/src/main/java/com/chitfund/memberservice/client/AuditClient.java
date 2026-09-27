package com.chitfund.memberservice.client;

import com.chitfund.common.event.AuditLogEvent;
import com.chitfund.common.event.SqsQueues;
import com.chitfund.common.outbox.DurableAuditOutbox;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.util.Objects;
import java.util.UUID;

@Component
@RequiredArgsConstructor
public class AuditClient {

    private final DurableAuditOutbox outbox;
    private final ObjectMapper objectMapper;

    public void log(String entityType, String entityId,
                    String action, String actorId, String actorRole,
                    Object before, Object after, String tenantId) {
        requireBusinessTransaction();
        try {
            String eventId = UUID.randomUUID().toString();
            AuditLogEvent event = new AuditLogEvent("member-service", entityType, entityId, null,
                    action, actorId, actorRole, null,
                    before != null ? objectMapper.writeValueAsString(before) : null,
                    after != null ? objectMapper.writeValueAsString(after) : null,
                    null, tenantId);
            outbox.enqueue(eventId, Objects.requireNonNull(tenantId, "tenantId"),
                    entityType, entityId, objectMapper.writeValueAsString(event), SqsQueues.AUDIT_EVENTS);
        } catch (Exception exception) {
            throw new IllegalStateException(
                    "Could not record the member audit event in the business transaction", exception);
        }
    }

    private static void requireBusinessTransaction() {
        if (!TransactionSynchronizationManager.isActualTransactionActive()) {
            throw new IllegalStateException(
                    "A member audit event must be recorded inside the business transaction");
        }
    }
}
