package com.chitfund.payoutservice.kafka;

import com.chitfund.common.context.TenantContext;
import com.chitfund.common.event.PayoutCreatedEvent;
import com.chitfund.common.event.PayoutDisbursedEvent;
import com.chitfund.common.event.SqsEventEnvelope;
import com.chitfund.common.event.SqsQueues;
import com.chitfund.payoutservice.config.EventDeliveryProperties;
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

@Component
@RequiredArgsConstructor
@Slf4j
public class PayoutEventPublisher {

    private final SqsTemplate sqsTemplate;
    private final ObjectMapper objectMapper;
    private final PayoutOutboxStore outboxStore;
    private final EventDeliveryProperties properties;

    public void publish(PayoutCreatedEvent event) {
        route(SqsQueues.EVT_PAYOUT_CREATED, event, event.payoutId());
    }

    public void publish(PayoutDisbursedEvent event) {
        route(SqsQueues.EVT_PAYOUT_DISBURSED, event, event.payoutId());
    }

    private void route(String eventType, Object event, String payoutId) {
        String eventId = UUID.randomUUID().toString();
        List<String> destinations = List.of(
                SqsQueues.NOTIFICATION_EVENTS, SqsQueues.REPORTING_EVENTS);
        EventDeliveryProperties.Mode mode = properties.getMode();

        if (mode.writesOutbox()) {
            if (!TransactionSynchronizationManager.isActualTransactionActive()) {
                throw new IllegalStateException(
                        "Transactional payout outbox requires an active business transaction");
            }
            outboxStore.enqueue(eventId, requireTenant(), payoutId, eventType,
                    serialize(event), destinations);
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
            String envelope = objectMapper.writeValueAsString(
                    new SqsEventEnvelope(eventId, eventType, serialize(event)));
            for (String destination : destinations) {
                try {
                    sqsTemplate.send(destination, envelope);
                } catch (Exception exception) {
                    log.warn("Legacy payout publish failed for {} ({}) to {}: {}",
                            eventType, eventId, destination, exception.getMessage());
                }
            }
        } catch (Exception exception) {
            log.warn("Legacy payout serialization failed for {} ({}): {}",
                    eventType, eventId, exception.getMessage());
        }
    }

    private String serialize(Object event) {
        try {
            return objectMapper.writeValueAsString(event);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Could not serialize payout event", exception);
        }
    }

    private String requireTenant() {
        String tenantId = TenantContext.get();
        if (tenantId == null || tenantId.isBlank()) {
            throw new IllegalStateException("Cannot write a payout outbox event without a tenant context");
        }
        return tenantId;
    }
}
