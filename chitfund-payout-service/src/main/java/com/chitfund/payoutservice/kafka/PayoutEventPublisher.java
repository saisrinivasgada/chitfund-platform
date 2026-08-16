package com.chitfund.payoutservice.kafka;

import com.chitfund.common.event.PayoutCreatedEvent;
import com.chitfund.common.event.PayoutDisbursedEvent;
import com.chitfund.common.event.SqsEventEnvelope;
import com.chitfund.common.event.SqsQueues;
import com.fasterxml.jackson.databind.ObjectMapper;
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
    private final ObjectMapper objectMapper;

    public void publish(PayoutCreatedEvent event) {
        sendTo(SqsQueues.NOTIFICATION_EVENTS, SqsQueues.EVT_PAYOUT_CREATED, event);
    }

    public void publish(PayoutDisbursedEvent event) {
        sendTo(SqsQueues.NOTIFICATION_EVENTS, SqsQueues.EVT_PAYOUT_DISBURSED, event);
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
