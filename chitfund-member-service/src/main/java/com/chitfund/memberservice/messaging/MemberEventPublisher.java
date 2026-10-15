package com.chitfund.memberservice.messaging;

import com.chitfund.common.event.MemberUpdatedEvent;
import com.chitfund.common.event.SqsQueues;
import com.chitfund.common.outbox.DurableEventOutbox;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.UUID;

@Component
@RequiredArgsConstructor
@Slf4j
public class MemberEventPublisher {

    private final DurableEventOutbox outbox;
    private final ObjectMapper objectMapper;

    public void publish(MemberUpdatedEvent event) {
        String eventId = UUID.randomUUID().toString();
        try {
            String payload = objectMapper.writeValueAsString(event);
            outbox.enqueue(eventId, SqsQueues.EVT_MEMBER_UPDATED, payload,
                    SqsQueues.NOTIFICATION_EVENTS);
            log.debug("Queued MemberUpdatedEvent {} for member {}", eventId, event.memberId());
        } catch (Exception e) {
            throw new IllegalStateException("Could not persist MemberUpdatedEvent " + eventId, e);
        }
    }
}
