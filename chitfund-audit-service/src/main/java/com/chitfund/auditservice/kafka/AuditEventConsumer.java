package com.chitfund.auditservice.kafka;

import com.chitfund.common.event.AuditLogEvent;
import com.chitfund.common.event.PaymentCompletedEvent;
import com.chitfund.common.event.SqsEventEnvelope;
import com.chitfund.common.event.SqsQueues;
import com.chitfund.auditservice.dto.AuditLogRequest;
import com.chitfund.auditservice.repository.EventInboxRepository;
import com.chitfund.auditservice.service.AuditService;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.awspring.cloud.sqs.annotation.SqsListener;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.Locale;
import java.util.UUID;

@Component
@RequiredArgsConstructor
@Slf4j
public class AuditEventConsumer {

    private final AuditService auditService;
    private final ObjectMapper objectMapper;
    private final EventInboxRepository inboxRepository;

    @SqsListener(SqsQueues.AUDIT_EVENTS)
    @Transactional
    public void onEvent(String raw) {
        try {
            SqsEventEnvelope envelope = objectMapper.readValue(raw, SqsEventEnvelope.class);
            if (isDuplicate(envelope)) {
                log.info("Ignoring duplicate audit event {} ({})",
                        envelope.eventId(), envelope.eventType());
                return;
            }
            switch (envelope.eventType()) {
                case SqsQueues.EVT_AUDIT_LOG -> {
                    AuditLogEvent event = objectMapper.readValue(envelope.payload(), AuditLogEvent.class);
                    auditService.record(new AuditLogRequest(
                            event.serviceName(), event.entityType(), event.entityId(),
                            event.chitId(), event.action(),
                            event.actorId(), event.actorRole(), event.actorIp(),
                            event.beforeState(), event.afterState(),
                            event.metadata(), event.tenantId()
                    ));
                }
                case SqsQueues.EVT_PAYMENT_COMPLETED -> {
                    PaymentCompletedEvent event = objectMapper.readValue(envelope.payload(), PaymentCompletedEvent.class);
                    auditService.record(new AuditLogRequest(
                            "payment-service", "PAYMENT_BATCH", event.batchId(),
                            event.chitId(), "PAYMENT_COMPLETED",
                            event.completedByUserId(), null, null,
                            null, null, null, event.tenantId()
                    ));
                }
                default -> log.warn("Unhandled audit event type: {}", envelope.eventType());
            }
        } catch (Exception e) {
            log.error("Failed to process audit event: {}", e.getMessage(), e);
            throw new IllegalStateException("Audit event processing failed", e);
        }
    }

    private boolean isDuplicate(SqsEventEnvelope envelope) {
        if (envelope.eventId() == null || envelope.eventId().isBlank()) {
            return false;
        }
        String eventId = canonicalEventId(envelope.eventId());
        return inboxRepository.claimIfAbsent(
                eventId, envelope.eventType(), LocalDateTime.now()) == 0;
    }

    private String canonicalEventId(String eventId) {
        String canonical = UUID.fromString(eventId).toString();
        if (!canonical.equals(eventId.toLowerCase(Locale.ROOT))) {
            throw new IllegalArgumentException("eventId must be a canonical UUID");
        }
        return canonical;
    }
}
