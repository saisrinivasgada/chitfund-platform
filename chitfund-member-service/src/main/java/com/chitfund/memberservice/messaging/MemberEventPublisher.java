package com.chitfund.memberservice.messaging;

import com.chitfund.common.event.MemberUpdatedEvent;
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
public class MemberEventPublisher {

    private final SqsTemplate sqsTemplate;
    private final ObjectMapper objectMapper;

    public void publish(MemberUpdatedEvent event) {
        CompletableFuture.runAsync(() -> {
            try {
                String payload = objectMapper.writeValueAsString(event);
                sqsTemplate.send(SqsQueues.NOTIFICATION_EVENTS,
                        new SqsEventEnvelope(SqsQueues.EVT_MEMBER_UPDATED, payload));
                log.debug("Published MemberUpdatedEvent for member {}", event.memberId());
            } catch (Exception e) {
                log.warn("Failed to publish MemberUpdatedEvent for member {}: {}", event.memberId(), e.getMessage());
            }
        });
    }
}
