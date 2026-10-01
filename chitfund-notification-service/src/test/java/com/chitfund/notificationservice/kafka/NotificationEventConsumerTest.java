package com.chitfund.notificationservice.kafka;

import com.chitfund.notificationservice.client.ChitServiceClient;
import com.chitfund.notificationservice.client.MemberServiceClient;
import com.chitfund.notificationservice.client.UserServiceClient;
import com.chitfund.notificationservice.sender.EmailSender;
import com.chitfund.notificationservice.service.InAppNotificationService;
import com.chitfund.notificationservice.service.ExpoPushService;
import com.chitfund.notificationservice.service.NotificationService;
import com.chitfund.notificationservice.repository.EventInboxRepository;
import com.chitfund.notificationservice.websocket.WebSocketBroadcaster;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class NotificationEventConsumerTest {

    private NotificationEventConsumer consumer(EventInboxRepository inbox,
                                                 NotificationService notificationService) {
        return new NotificationEventConsumer(
                notificationService,
                mock(InAppNotificationService.class),
                mock(ExpoPushService.class),
                mock(EmailSender.class),
                new ObjectMapper(),
                mock(WebSocketBroadcaster.class),
                mock(MemberServiceClient.class),
                mock(UserServiceClient.class),
                mock(ChitServiceClient.class),
                inbox);
    }

    @Test
    void malformedMessageFailsSoSqsCanRetryIt() {
        NotificationEventConsumer consumer = consumer(
                mock(EventInboxRepository.class), mock(NotificationService.class));

        assertThatThrownBy(() -> consumer.onEvent("not-json"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("processing failed");
    }

    @Test
    void duplicateEventIsAcknowledgedWithoutSendingAgain() {
        NotificationService notificationService = mock(NotificationService.class);
        EventInboxRepository inbox = mock(EventInboxRepository.class);
        when(inbox.claimIfAbsent(eq("22222222-2222-2222-2222-222222222222"),
                eq("PAYMENT_COMPLETED"), any())).thenReturn(0);

        consumer(inbox, notificationService).onEvent("""
                {"eventId":"22222222-2222-2222-2222-222222222222",
                 "eventType":"PAYMENT_COMPLETED","payload":"{}"}
                """);

        verify(notificationService, never()).send(any(), any());
    }

    @Test
    void nonCanonicalEventIdFailsInsteadOfBeingSilentlyTruncated() {
        EventInboxRepository inbox = mock(EventInboxRepository.class);

        assertThatThrownBy(() -> consumer(inbox, mock(NotificationService.class)).onEvent("""
                {"eventId":"not-a-uuid","eventType":"PAYMENT_COMPLETED","payload":"{}"}
                """))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("processing failed");
        verify(inbox, never()).claimIfAbsent(any(), any(), any());
    }

    @Test
    void legacyEnvelopeWithoutEventIdRemainsCompatible() {
        EventInboxRepository inbox = mock(EventInboxRepository.class);

        consumer(inbox, mock(NotificationService.class)).onEvent(
                "{\"eventType\":\"LEGACY_UNKNOWN\",\"payload\":\"{}\"}");

        verify(inbox, never()).claimIfAbsent(any(), any(), any());
    }

    @Test
    void adminAndManagerFanoutIsTenantScopedAndSendsOnePushPerRecipient() {
        UserServiceClient users = mock(UserServiceClient.class);
        InAppNotificationService inApp = mock(InAppNotificationService.class);
        ExpoPushService push = mock(ExpoPushService.class);
        String adminId = UUID.randomUUID().toString();
        String managerId = UUID.randomUUID().toString();
        when(users.getUserIdsByRole("tenant-a", "ADMIN")).thenReturn(List.of(adminId));
        when(users.getUserIdsByRole("tenant-a", "MANAGER")).thenReturn(List.of(managerId));
        NotificationEventConsumer consumer = new NotificationEventConsumer(
                mock(NotificationService.class), inApp, push, mock(EmailSender.class),
                new ObjectMapper(), mock(WebSocketBroadcaster.class),
                mock(MemberServiceClient.class), users, mock(ChitServiceClient.class),
                mock(EventInboxRepository.class));

        ReflectionTestUtils.invokeMethod(consumer, "notifyAdminsAndManagers",
                "tenant-a", "Title", "Message", "CASH_REQUEST_SUBMITTED",
                Map.of("requestId", "request-a"), "/payments");

        verify(users).getUserIdsByRole("tenant-a", "ADMIN");
        verify(users).getUserIdsByRole("tenant-a", "MANAGER");
        verify(inApp).create(eq("tenant-a"), eq(UUID.fromString(adminId)), eq("Title"),
                eq("Message"), eq("CASH_REQUEST_SUBMITTED"), any(), eq("/payments"));
        verify(inApp).create(eq("tenant-a"), eq(UUID.fromString(managerId)), eq("Title"),
                eq("Message"), eq("CASH_REQUEST_SUBMITTED"), any(), eq("/payments"));
        verify(push).sendToUserWithData(eq(UUID.fromString(adminId)), eq("Title"),
                eq("Message"), eq(Map.of("screen", "payments")));
        verify(push).sendToUserWithData(eq(UUID.fromString(managerId)), eq("Title"),
                eq("Message"), eq(Map.of("screen", "payments")));
    }
}
