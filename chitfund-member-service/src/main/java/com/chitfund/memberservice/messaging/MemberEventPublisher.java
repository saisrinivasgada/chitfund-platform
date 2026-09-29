package com.chitfund.memberservice.messaging;

import com.chitfund.common.event.MemberUpdatedEvent;
import com.chitfund.common.event.SqsEventEnvelope;
import com.chitfund.common.event.SqsQueues;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.awspring.cloud.sqs.operations.SqsTemplate;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.util.UUID;
import java.util.concurrent.CompletableFuture;

@Component
@RequiredArgsConstructor
@Slf4j
public class MemberEventPublisher {

    private final SqsTemplate sqsTemplate;
    private final ObjectMapper objectMapper;

    public void publish(MemberUpdatedEvent event) {
        String eventId = UUID.randomUUID().toString();
        Runnable send = () -> {
            try {
                String payload = objectMapper.writeValueAsString(event);
                sqsTemplate.send(SqsQueues.NOTIFICATION_EVENTS,
                        new SqsEventEnvelope(eventId, SqsQueues.EVT_MEMBER_UPDATED, payload));
                log.debug("Published MemberUpdatedEvent {} for member {}", eventId, event.memberId());
            } catch (Exception e) {
                log.warn("Failed to publish MemberUpdatedEvent {} for member {}: {}",
                        eventId, event.memberId(), e.getClass().getSimpleName());
            }
        };
        publishAfterCommit(send);
    }

    private void publishAfterCommit(Runnable send) {
        if (TransactionSynchronizationManager.isActualTransactionActive()
                && TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    CompletableFuture.runAsync(send);
                }
            });
        } else {
            CompletableFuture.runAsync(send);
        }
    }
}
