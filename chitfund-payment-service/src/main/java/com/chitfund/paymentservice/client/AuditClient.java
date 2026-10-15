package com.chitfund.paymentservice.client;

import com.chitfund.common.event.AuditLogEvent;
import com.chitfund.common.event.SqsQueues;
import com.chitfund.common.logging.AuditRequestContext;
import com.chitfund.paymentservice.kafka.PaymentOutboxStore;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.time.Instant;
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
        log(AuditDetails.builder()
                .entityType(entityType)
                .entityId(entityId)
                .chitId(chitId)
                .action(action)
                .actorId(actorId)
                .actorRole(actorRole)
                .before(before)
                .after(after)
                .tenantId(tenantId)
                .build());
    }

    /**
     * Records a durable organization-activity fact in the same transaction as
     * the financial operation. Optional context is deliberately explicit so
     * retries, offline occurrence time and sensitive reasons are not flattened
     * into an unsearchable metadata string.
     */
    public void log(AuditDetails details) {
        if (!TransactionSynchronizationManager.isActualTransactionActive()) {
            throw new IllegalStateException(
                    "A payment audit event must be recorded inside the business transaction");
        }
        try {
            AuditRequestContext context = AuditRequestContext.current();
            String eventId = UUID.randomUUID().toString();
            AuditLogEvent event = new AuditLogEvent(
                    "payment-service",
                    details.entityType(),
                    details.entityId(),
                    details.chitId(),
                    details.action(),
                    details.actorId(),
                    details.actorRole(),
                    context.actorIp(),
                    toJson(details.before()),
                    toJson(details.after()),
                    toJson(details.metadata()),
                    details.tenantId(),
                    context.correlationIdOr(details.correlationId()),
                    context.idempotencyKeyOr(details.idempotencyKey()),
                    context.sourceOr(details.source()),
                    details.outcome() != null ? details.outcome() : "SUCCESS",
                    details.reason(),
                    details.effectiveActorId(),
                    details.effectiveActorRole(),
                    context.deviceSessionHashOr(details.deviceSessionHash()),
                    details.occurredAt() != null ? details.occurredAt() : Instant.now(),
                    details.originalOfflineAt(),
                    details.synchronizedAt());
            outboxStore.enqueue(eventId, details.tenantId(), details.entityType(), details.entityId(),
                    SqsQueues.EVT_AUDIT_LOG, objectMapper.writeValueAsString(event),
                    List.of(SqsQueues.AUDIT_EVENTS));
        } catch (Exception exception) {
            throw new IllegalStateException(
                    "Could not record the payment audit event in the transactional outbox", exception);
        }
    }

    private String toJson(Object value) throws Exception {
        return value != null ? objectMapper.writeValueAsString(value) : null;
    }

    @lombok.Builder
    public record AuditDetails(
            String entityType,
            String entityId,
            String chitId,
            String action,
            String actorId,
            String actorRole,
            Object before,
            Object after,
            Object metadata,
            String tenantId,
            String correlationId,
            String idempotencyKey,
            String source,
            String outcome,
            String reason,
            String effectiveActorId,
            String effectiveActorRole,
            String deviceSessionHash,
            Instant occurredAt,
            Instant originalOfflineAt,
            Instant synchronizedAt
    ) { }
}
