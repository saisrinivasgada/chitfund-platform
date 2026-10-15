package com.chitfund.userservice.event;

import com.chitfund.common.event.SqsQueues;
import com.chitfund.common.outbox.DurableEventOutbox;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

class NotificationEventPublisherTest {

    private final DurableEventOutbox outbox = mock(DurableEventOutbox.class);
    private final NotificationEventPublisher publisher = new NotificationEventPublisher(
            outbox, new ObjectMapper());

    @Test
    void pushIsPersistedForDurableDelivery() {
        publisher.publishPush(UUID.randomUUID(), "Title", "Body", Map.of("screen", "home"));

        verify(outbox).enqueue(anyString(),
                org.mockito.ArgumentMatchers.eq(SqsQueues.EVT_PUSH_NOTIFICATION),
                anyString(), org.mockito.ArgumentMatchers.eq(SqsQueues.NOTIFICATION_EVENTS));
    }

    @Test
    void persistenceFailureFailsTheBusinessOperation() {
        doThrow(new IllegalStateException("database unavailable"))
                .when(outbox).enqueue(anyString(), anyString(), anyString(), anyString());

        assertThatThrownBy(() -> publisher.publishEmail(
                "recipient@example.test", "Subject", "<p>Body</p>", "Body"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("Could not persist");
    }

    @Test
    void inAppEventCarriesExplicitTenant() {
        var payload = org.mockito.ArgumentCaptor.forClass(String.class);

        publisher.publishInApp("tenant-a", UUID.randomUUID(), "Title", "Body",
                "GENERAL", null, "/home");

        verify(outbox).enqueue(anyString(),
                org.mockito.ArgumentMatchers.eq(SqsQueues.EVT_IN_APP_NOTIFICATION),
                payload.capture(), org.mockito.ArgumentMatchers.eq(SqsQueues.NOTIFICATION_EVENTS));
        assertThat(payload.getValue()).contains("\"tenantId\":\"tenant-a\"");
    }
}
