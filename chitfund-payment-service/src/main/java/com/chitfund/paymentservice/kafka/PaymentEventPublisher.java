package com.chitfund.paymentservice.kafka;

import com.chitfund.common.event.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.awspring.cloud.sqs.operations.SqsTemplate;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.concurrent.CompletableFuture;

/**
 * Publishes domain events to consolidated SQS queues.
 *
 * WHY try-catch instead of letting exceptions propagate?
 * The DB write already committed when this is called. If SQS is temporarily
 * unreachable we must NOT roll back the payment — that creates a DB/UI split.
 * We accept best-effort delivery here. Production upgrade path: Transactional
 * Outbox Pattern (write event row in same DB transaction, CDC publishes to SQS).
 *
 * WHY keep the kafka package name?
 * Renaming the package would require updating every import in the service
 * classes. The class is swapped; the package name is cosmetic — not worth the churn.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class PaymentEventPublisher {

    private final SqsTemplate sqsTemplate;
    private final ObjectMapper objectMapper;

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
        CompletableFuture.runAsync(() -> {
            try {
                String payload = objectMapper.writeValueAsString(event);
                sqsTemplate.send(queue, new SqsEventEnvelope(eventType, payload));
                log.debug("Published {} to queue {}", eventType, queue);
            } catch (Exception e) {
                log.warn("Failed to publish {} to queue {}: {}", eventType, queue, e.getMessage());
            }
        });
    }
}
