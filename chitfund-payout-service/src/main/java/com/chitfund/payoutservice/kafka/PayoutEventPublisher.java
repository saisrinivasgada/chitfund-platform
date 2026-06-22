package com.chitfund.payoutservice.kafka;

import com.chitfund.common.event.PayoutCreatedEvent;
import com.chitfund.common.event.PayoutDisbursedEvent;
import com.chitfund.common.event.SqsQueues;
import io.awspring.cloud.sqs.operations.SqsTemplate;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.concurrent.CompletableFuture;

@Component
@RequiredArgsConstructor
@Slf4j
public class PayoutEventPublisher {

    private final SqsTemplate sqsTemplate;

    public void publish(PayoutCreatedEvent event) {
        send(SqsQueues.PAYOUT_CREATED, event);
    }

    public void publish(PayoutDisbursedEvent event) {
        send(SqsQueues.PAYOUT_DISBURSED, event);
    }

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
