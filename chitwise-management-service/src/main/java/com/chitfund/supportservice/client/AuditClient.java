package com.chitfund.supportservice.client;

import com.chitfund.common.event.AuditLogEvent;
import com.chitfund.common.event.SqsQueues;
import com.chitfund.common.outbox.DurableAuditOutbox;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

@Component
@RequiredArgsConstructor
public class AuditClient {

    private final DurableAuditOutbox outbox;
    private final ObjectMapper objectMapper;

    /**
     * Adds an organization-visible Hub/support action to the same transaction as the ticket
     * mutation. Message bodies and requester contact details are deliberately never copied.
     */
    public void log(String entityId, String action, String actorId, String actorRole,
                    Object before, Object after, Object metadata, String tenantId, String reason) {
        if (!TransactionSynchronizationManager.isActualTransactionActive()) {
            throw new IllegalStateException(
                    "A management audit event must be recorded inside the business transaction");
        }
        try {
            String eventId = UUID.randomUUID().toString();
            AuditLogEvent event = new AuditLogEvent(
                    "management-service", "TICKET", entityId, null, action,
                    actorId, actorRole, null,
                    json(before), json(after), json(metadata),
                    Objects.requireNonNull(tenantId, "tenantId"),
                    null, null, "UNKNOWN", "SUCCESS", reason,
                    null, null, null, Instant.now(), null, null);
            outbox.enqueue(eventId, tenantId, "TICKET", entityId,
                    objectMapper.writeValueAsString(event), SqsQueues.AUDIT_EVENTS);
        } catch (Exception exception) {
            throw new IllegalStateException(
                    "Could not record the management audit event in the business transaction",
                    exception);
        }
    }

    private String json(Object value) throws Exception {
        return value == null ? null : objectMapper.writeValueAsString(value);
    }
}
