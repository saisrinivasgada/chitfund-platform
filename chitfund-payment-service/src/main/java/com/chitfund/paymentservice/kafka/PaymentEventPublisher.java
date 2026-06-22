package com.chitfund.paymentservice.kafka;

import com.chitfund.common.event.*;
import io.awspring.cloud.sqs.operations.SqsTemplate;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.concurrent.CompletableFuture;

/**
 * Publishes domain events to SQS queues.
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

    public void publish(ChitMonthOpenedEvent event) {
        send(SqsQueues.MONTH_OPENED, event);
    }

    public void publish(ChitMonthSkippedEvent event) {
        send(SqsQueues.MONTH_SKIPPED, event);
    }

    public void publish(CashCollectedEvent event) {
        send(SqsQueues.CASH_COLLECTED, event);
    }

    public void publish(PaymentCompletedEvent event) {
        send(SqsQueues.PAYMENT_COMPLETED, event);
    }

    // WHY CompletableFuture.runAsync()?
    // sqsTemplate.send() blocks until AWS SQS responds. If the queue doesn't exist
    // or IAM credentials aren't set up, the AWS SDK retries with backoff for 30-60s
    // before throwing — making every draw open hang for a minute. Running async means
    // the HTTP response returns immediately after the DB commit; SQS delivery is
    // best-effort in the background (matches the try-catch contract above).
    private void send(String queue, Object event) {
        CompletableFuture.runAsync(() -> {
            try {
                sqsTemplate.send(queue, event);
                log.debug("Published {} to queue {}", event.getClass().getSimpleName(), queue);
            } catch (Exception e) {
                log.warn("Failed to publish {} to queue {}: {}", event.getClass().getSimpleName(), queue, e.getMessage());
            }
        });
    }
}
