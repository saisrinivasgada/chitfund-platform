package com.chitfund.notificationservice.kafka;

import com.chitfund.notificationservice.client.ChitServiceClient;
import com.chitfund.notificationservice.client.MemberServiceClient;
import com.chitfund.notificationservice.client.UserServiceClient;
import com.chitfund.notificationservice.service.InAppNotificationService;
import com.chitfund.notificationservice.service.ExpoPushService;
import com.chitfund.notificationservice.service.NotificationService;
import com.chitfund.notificationservice.websocket.WebSocketBroadcaster;
import com.chitfund.notificationservice.repository.EventInboxRepository;
import com.chitfund.common.event.SqsEventEnvelope;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class NotificationEventConsumerTest {

    @Test
    void malformedMessageFailsSoSqsCanRetryIt() {
        NotificationEventConsumer consumer = new NotificationEventConsumer(
                mock(NotificationService.class),
                mock(InAppNotificationService.class),
                mock(ExpoPushService.class),
                new ObjectMapper(),
                mock(WebSocketBroadcaster.class),
                mock(MemberServiceClient.class),
                mock(UserServiceClient.class),
                mock(ChitServiceClient.class),
                mock(EventInboxRepository.class));

        assertThatThrownBy(() -> consumer.onEvent("not-json"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("processing failed");
    }

    @Test
    void duplicateEventIdIsAcknowledgedWithoutSendingAgain() throws Exception {
        NotificationService notifications = mock(NotificationService.class);
        InAppNotificationService inApp = mock(InAppNotificationService.class);
        ExpoPushService push = mock(ExpoPushService.class);
        WebSocketBroadcaster broadcaster = mock(WebSocketBroadcaster.class);
        MemberServiceClient members = mock(MemberServiceClient.class);
        UserServiceClient users = mock(UserServiceClient.class);
        ChitServiceClient chits = mock(ChitServiceClient.class);
        EventInboxRepository inbox = mock(EventInboxRepository.class);
        ObjectMapper mapper = new ObjectMapper();
        when(inbox.existsById("event-1")).thenReturn(true);
        NotificationEventConsumer consumer = new NotificationEventConsumer(
                notifications, inApp, push, mapper, broadcaster, members, users, chits, inbox);
        String raw = mapper.writeValueAsString(
                new SqsEventEnvelope("event-1", "PAYMENT_COMPLETED", "{}"));

        consumer.onEvent(raw);

        verifyNoInteractions(notifications, inApp, push, broadcaster, members, users, chits);
    }
}
