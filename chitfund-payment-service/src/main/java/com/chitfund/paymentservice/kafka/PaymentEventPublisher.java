package com.chitfund.paymentservice.kafka;

import com.chitfund.common.context.TenantContext;
import com.chitfund.common.event.CashCollectedEvent;
import com.chitfund.common.event.CashRequestEvent;
import com.chitfund.common.event.ChitMonthOpenedEvent;
import com.chitfund.common.event.ChitMonthSkippedEvent;
import com.chitfund.common.event.PaymentCompletedEvent;
import com.chitfund.common.event.SqsEventEnvelope;
import com.chitfund.common.event.SqsQueues;
import com.chitfund.paymentservice.config.EventDeliveryProperties;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.awspring.cloud.sqs.operations.SqsTemplate;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.util.List;
import java.util.UUID;

/**
 * Captures payment-domain events transactionally and routes them to SQS.
 *
 * In OUTBOX mode every delivery row is inserted in the caller's business
 * transaction. The relay performs network I/O only after that transaction has
 * committed. LEGACY remains the safe rollout default and DUAL uses the same
 * event ID on both paths so consumer inboxes suppress the duplicate.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class PaymentEventPublisher {

    private final SqsTemplate sqsTemplate;
    private final ObjectMapper objectMapper;
    private final PaymentOutboxStore outboxStore;
    private final EventDeliveryProperties properties;

    public void publish(ChitMonthOpenedEvent event) {
        route(SqsQueues.EVT_MONTH_OPENED, event, "CHIT", event.chitId(), List.of(
                SqsQueues.NOTIFICATION_EVENTS, SqsQueues.REPORTING_EVENTS));
    }

    public void publish(ChitMonthSkippedEvent event) {
        route(SqsQueues.EVT_MONTH_SKIPPED, event, "CHIT", event.chitId(), List.of(
                SqsQueues.NOTIFICATION_EVENTS, SqsQueues.REPORTING_EVENTS));
    }

    public void publish(CashCollectedEvent event) {
        route(SqsQueues.EVT_CASH_COLLECTED, event, "PAYMENT_BATCH", event.batchId(), List.of(
                SqsQueues.NOTIFICATION_EVENTS, SqsQueues.AUDIT_EVENTS));
    }

    public void publish(PaymentCompletedEvent event) {
        route(SqsQueues.EVT_PAYMENT_COMPLETED, event, "PAYMENT_BATCH", event.batchId(), List.of(
                SqsQueues.NOTIFICATION_EVENTS, SqsQueues.AUDIT_EVENTS,
                SqsQueues.REPORTING_EVENTS));
    }

    public void publish(CashRequestEvent event) {
        route(SqsQueues.EVT_CASH_REQUEST_EVENT, event, "CASH_REQUEST", event.requestId(), List.of(
                SqsQueues.NOTIFICATION_EVENTS));
    }

    private void route(String eventType, Object event, String aggregateType,
                       String aggregateId, List<String> destinations) {
        String eventId = UUID.randomUUID().toString();
        EventDeliveryProperties.Mode mode = properties.getMode();

        if (mode.writesOutbox()) {
            if (!TransactionSynchronizationManager.isActualTransactionActive()) {
                throw new IllegalStateException(
                        "Transactional outbox publication requires an active business transaction");
            }
            outboxStore.enqueue(eventId, requireTenant(), aggregateType, aggregateId,
                    eventType, serialize(event), destinations);
        }

        if (mode.publishesLegacy()) {
            Runnable send = () -> sendDirect(eventId, eventType, event, destinations);
            if (TransactionSynchronizationManager.isActualTransactionActive()
                    && TransactionSynchronizationManager.isSynchronizationActive()) {
                TransactionSynchronizationManager.registerSynchronization(
                        new TransactionSynchronization() {
                            @Override
                            public void afterCommit() {
                                send.run();
                            }
                        });
            } else {
                send.run();
            }
        }
    }

    private void sendDirect(String eventId, String eventType, Object event,
                            List<String> destinations) {
        try {
            String payload = serialize(event);
            String envelope = objectMapper.writeValueAsString(
                    new SqsEventEnvelope(eventId, eventType, payload));
            for (String destination : destinations) {
                try {
                    sqsTemplate.send(destination, envelope);
                    log.debug("Legacy-published {} ({}) to {}", eventType, eventId, destination);
                } catch (Exception exception) {
                    log.warn("Legacy publish failed for {} ({}) to {}: {}",
                            eventType, eventId, destination, exception.getMessage());
                }
            }
        } catch (Exception exception) {
            log.warn("Legacy serialization failed for {} ({}): {}",
                    eventType, eventId, exception.getMessage());
        }
    }

    private String serialize(Object event) {
        try {
            return objectMapper.writeValueAsString(event);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Could not serialize financial event", exception);
        }
    }

    private String requireTenant() {
        String tenantId = TenantContext.get();
        if (tenantId == null || tenantId.isBlank()) {
            throw new IllegalStateException("Cannot write an outbox event without a tenant context");
        }
        return tenantId;
    }
}
