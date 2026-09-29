package com.chitfund.memberservice.messaging;

import com.chitfund.common.event.MemberUpdatedEvent;
import com.chitfund.common.event.SqsQueues;
import com.chitfund.common.outbox.DurableEventOutbox;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

class MemberEventPublisherTest {

    private final DurableEventOutbox outbox = mock(DurableEventOutbox.class);
    private final MemberEventPublisher publisher = new MemberEventPublisher(
            outbox, new ObjectMapper().findAndRegisterModules());

    @Test
    void memberUpdateIsPersistedForDurableDelivery() {
        publisher.publish(event());

        verify(outbox).enqueue(anyString(),
                org.mockito.ArgumentMatchers.eq(SqsQueues.EVT_MEMBER_UPDATED),
                anyString(), org.mockito.ArgumentMatchers.eq(SqsQueues.NOTIFICATION_EVENTS));
    }

    @Test
    void persistenceFailureFailsTheBusinessOperation() {
        doThrow(new IllegalStateException("database unavailable"))
                .when(outbox).enqueue(anyString(), anyString(), anyString(), anyString());

        assertThatThrownBy(() -> publisher.publish(event()))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("Could not persist MemberUpdatedEvent");
    }

    private MemberUpdatedEvent event() {
        return new MemberUpdatedEvent("tenant-a", "member-a", "referredById",
                null, "referrer-a", null, "Referrer", "actor-a", Instant.now());
    }
}
