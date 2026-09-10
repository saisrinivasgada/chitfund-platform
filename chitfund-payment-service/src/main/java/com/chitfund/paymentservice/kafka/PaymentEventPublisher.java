package com.chitfund.paymentservice.kafka;

import com.chitfund.common.event.*;
import com.chitfund.common.context.TenantContext;
import com.chitfund.paymentservice.domain.EventOutbox;
import com.chitfund.paymentservice.repository.EventOutboxRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.awspring.cloud.sqs.operations.SqsTemplate;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.util.UUID;

/**
 * Publishes domain events to consolidated SQS queues.
 *
 * With the outbox enabled, each destination gets a durable row inside the
 * caller's business transaction. With it disabled, the legacy SQS send is
 * deferred until commit so a rollback cannot publish a phantom event.
 *
 * WHY keep the kafka package name?
 * Renaming the package would require updating every import in the service
 * classes. The class is swapped; the package name is cosmetic — not worth the churn.
 */
@Component
@Slf4j
public class PaymentEventPublisher {

    private final SqsTemplate sqsTemplate;
    private final ObjectMapper objectMapper;
    private final EventOutboxRepository outboxRepository;
    private final boolean outboxEnabled;

    public PaymentEventPublisher(
            SqsTemplate sqsTemplate,
            ObjectMapper objectMapper,
            EventOutboxRepository outboxRepository,
            @Value("${chitwise.outbox.enabled:false}") boolean outboxEnabled) {
        this.sqsTemplate = sqsTemplate;
        this.objectMapper = objectMapper;
        this.outboxRepository = outboxRepository;
        this.outboxEnabled = outboxEnabled;
    }

    public void publish(ChitMonthOpenedEvent event) {
        sendTo(SqsQueues.NOTIFICATION_EVENTS, SqsQueues.EVT_MONTH_OPENED, event);
        sendTo(SqsQueues.REPORTING_EVENTS,    SqsQueues.EVT_MONTH_OPENED, event);
    }

    public void publish(ChitMonthSkippedEvent event) {
        sendTo(SqsQueues.NOTIFICATION_EVENTS, SqsQueues.EVT_MONTH_SKIPPED, event);
        sendTo(SqsQueues.REPORTING_EVENTS,    SqsQueues.EVT_MONTH_SKIPPED, event);
    }

    public void publish(CashCollectedEvent event) {
        // Both notification and audit need this event — send to each queue separately
        // so each service gets its own copy (SQS is point-to-point, not pub/sub).
        sendTo(SqsQueues.NOTIFICATION_EVENTS, SqsQueues.EVT_CASH_COLLECTED, event);
        sendTo(SqsQueues.AUDIT_EVENTS,        SqsQueues.EVT_CASH_COLLECTED, event);
    }

    public void publish(PaymentCompletedEvent event) {
        sendTo(SqsQueues.NOTIFICATION_EVENTS, SqsQueues.EVT_PAYMENT_COMPLETED, event);
        sendTo(SqsQueues.AUDIT_EVENTS,        SqsQueues.EVT_PAYMENT_COMPLETED, event);
        sendTo(SqsQueues.REPORTING_EVENTS,    SqsQueues.EVT_PAYMENT_COMPLETED, event);
    }

    public void publish(CashRequestEvent event) {
        sendTo(SqsQueues.NOTIFICATION_EVENTS, SqsQueues.EVT_CASH_REQUEST_EVENT, event);
    }

    private void sendTo(String queue, String eventType, Object event) {
        try {
            String payload = objectMapper.writeValueAsString(event);
            String eventId = UUID.randomUUID().toString();
            if (outboxEnabled) {
                if (!TransactionSynchronizationManager.isActualTransactionActive()) {
                    throw new IllegalStateException(
                            "Outbox publication requires an active business transaction");
                }
                outboxRepository.save(EventOutbox.builder()
                        .id(UUID.fromString(eventId))
                        .tenantId(requireTenant())
                        .aggregateType(event.getClass().getSimpleName())
                        .aggregateId(aggregateId(event))
                        .eventType(eventType)
                        .destination(queue)
                        .payload(payload)
                        .build());
                return;
            }

            Runnable send = () -> sendDirect(queue, eventId, eventType, payload);
            if (TransactionSynchronizationManager.isActualTransactionActive()
                    && TransactionSynchronizationManager.isSynchronizationActive()) {
                TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                    @Override
                    public void afterCommit() {
                        send.run();
                    }
                });
            } else {
                send.run();
            }
        } catch (RuntimeException e) {
            throw e;
        } catch (Exception e) {
            throw new IllegalStateException("Could not serialize " + eventType + " event", e);
        }
    }

    private void sendDirect(String queue, String eventId, String eventType, String payload) {
        try {
            String envelope = objectMapper.writeValueAsString(
                    new SqsEventEnvelope(eventId, eventType, payload));
            sqsTemplate.send(queue, envelope);
            log.debug("Published {} event {} to queue {}", eventType, eventId, queue);
        } catch (Exception e) {
            // This path only exists while the outbox feature flag is off.
            log.error("Direct event publish failed for {} event {} to {}: {}",
                    eventType, eventId, queue, e.getMessage(), e);
        }
    }

    private String requireTenant() {
        String tenantId = TenantContext.get();
        if (tenantId == null || tenantId.isBlank()) {
            throw new IllegalStateException("Outbox event cannot be created without a tenant");
        }
        return tenantId;
    }

    private String aggregateId(Object event) {
        if (event instanceof ChitMonthOpenedEvent value) return value.chitId();
        if (event instanceof ChitMonthSkippedEvent value) return value.chitId();
        if (event instanceof CashCollectedEvent value) return value.batchId();
        if (event instanceof PaymentCompletedEvent value) return value.batchId();
        if (event instanceof CashRequestEvent value) return value.requestId();
        throw new IllegalArgumentException("Unsupported payment event type: " + event.getClass().getName());
    }
}
