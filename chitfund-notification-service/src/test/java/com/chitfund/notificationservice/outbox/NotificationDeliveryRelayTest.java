package com.chitfund.notificationservice.outbox;

import com.chitfund.notificationservice.domain.UserPushToken;
import com.chitfund.notificationservice.repository.UserPushTokenRepository;
import com.chitfund.notificationservice.sender.EmailSender;
import com.chitfund.notificationservice.sender.NotificationSender;
import com.chitfund.notificationservice.service.ExpoPushService;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.LocalDateTime;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class NotificationDeliveryRelayTest {

    private final ObjectMapper mapper = new ObjectMapper();

    @Test
    void successfulEmailIsMarkedPublishedOnlyAfterProviderAcceptsIt() throws Exception {
        NotificationDeliveryOutbox outbox = mock(NotificationDeliveryOutbox.class);
        EmailSender email = mock(EmailSender.class);
        NotificationDelivery delivery = new NotificationDelivery(
                "delivery-1", "event-1", "tenant-a", null,
                NotificationDeliveryQueue.EMAIL,
                mapper.writeValueAsString(new NotificationDeliveryQueue.EmailPayload(
                        "member@example.com", "Subject", "Text", "<p>Html</p>")),
                0, "lease-1");
        when(outbox.markPublished(delivery, null)).thenReturn(true);
        NotificationDeliveryRelay relay = relay(outbox, mock(ExpoPushService.class),
                email, mock(NotificationSender.class), mock(UserPushTokenRepository.class));

        relay.deliverOne(delivery);

        verify(email).send("member@example.com", "Subject", "Text", "<p>Html</p>");
        verify(outbox).markPublished(delivery, null);
    }

    @Test
    void ownedPushIsSentWithGenericCopyAndNavigationOnly() throws Exception {
        NotificationDeliveryOutbox outbox = mock(NotificationDeliveryOutbox.class);
        ExpoPushService push = mock(ExpoPushService.class);
        UserPushTokenRepository tokens = mock(UserPushTokenRepository.class);
        UUID tokenId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        when(tokens.findById(tokenId)).thenReturn(Optional.of(UserPushToken.builder()
                .id(tokenId).userId(userId).token("ExpoPushToken[device]").build()));
        when(outbox.markPublished(any(), any())).thenReturn(true);
        NotificationDelivery delivery = pushDelivery(new NotificationDeliveryQueue.PushPayload(
                tokenId.toString(), userId.toString(), Map.of("screen", "payouts", "amount", "50000")));
        NotificationDeliveryRelay relay = relay(outbox, push, mock(EmailSender.class),
                mock(NotificationSender.class), tokens);

        relay.deliverOne(delivery);

        verify(push).sendToToken("ExpoPushToken[device]",
                NotificationDeliveryQueue.GENERIC_PUSH_TITLE,
                NotificationDeliveryQueue.GENERIC_PUSH_BODY,
                Map.of("screen", "payouts"));
        verify(outbox).markPublished(delivery, null);
    }

    @Test
    void logoutUnregisteredTokenIsSkippedAndMarkedCompleteNeverSent() throws Exception {
        NotificationDeliveryOutbox outbox = mock(NotificationDeliveryOutbox.class);
        ExpoPushService push = mock(ExpoPushService.class);
        UserPushTokenRepository tokens = mock(UserPushTokenRepository.class);
        UUID tokenId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        when(tokens.findById(tokenId)).thenReturn(Optional.empty());
        when(outbox.markPublished(any(), any())).thenReturn(true);
        NotificationDelivery delivery = pushDelivery(new NotificationDeliveryQueue.PushPayload(
                tokenId.toString(), userId.toString(), Map.of("screen", "payouts")));
        NotificationDeliveryRelay relay = relay(outbox, push, mock(EmailSender.class),
                mock(NotificationSender.class), tokens);

        relay.deliverOne(delivery);

        verify(push, never()).sendToToken(anyString(), anyString(), anyString(), any());
        verify(outbox).markPublished(delivery, null);
    }

    @Test
    void reassignedTokenIsSkippedAndMarkedCompleteNeverSent() throws Exception {
        NotificationDeliveryOutbox outbox = mock(NotificationDeliveryOutbox.class);
        ExpoPushService push = mock(ExpoPushService.class);
        UserPushTokenRepository tokens = mock(UserPushTokenRepository.class);
        UUID tokenId = UUID.randomUUID();
        UUID intendedUser = UUID.randomUUID();
        UUID newOwner = UUID.randomUUID();
        when(tokens.findById(tokenId)).thenReturn(Optional.of(UserPushToken.builder()
                .id(tokenId).userId(newOwner).token("ExpoPushToken[device]").build()));
        when(outbox.markPublished(any(), any())).thenReturn(true);
        NotificationDelivery delivery = pushDelivery(new NotificationDeliveryQueue.PushPayload(
                tokenId.toString(), intendedUser.toString(), Map.of("screen", "payouts")));
        NotificationDeliveryRelay relay = relay(outbox, push, mock(EmailSender.class),
                mock(NotificationSender.class), tokens);

        relay.deliverOne(delivery);

        verify(push, never()).sendToToken(anyString(), anyString(), anyString(), any());
        verify(outbox).markPublished(delivery, null);
    }

    @Test
    void legacyRawTokenPayloadIsSkippedAndMarkedCompleteNeverSent() throws Exception {
        NotificationDeliveryOutbox outbox = mock(NotificationDeliveryOutbox.class);
        ExpoPushService push = mock(ExpoPushService.class);
        UserPushTokenRepository tokens = mock(UserPushTokenRepository.class);
        when(outbox.markPublished(any(), any())).thenReturn(true);
        // Frozen pre-fix payload that carried the raw token + sensitive copy.
        String legacyPayload = "{\"token\":\"ExpoPushToken[device]\",\"title\":\"Payout ready\","
                + "\"body\":\"Member Ramesh won\",\"data\":{\"screen\":\"payouts\"}}";
        NotificationDelivery delivery = new NotificationDelivery(
                "delivery-1", "event-1", "tenant-a", null,
                NotificationDeliveryQueue.PUSH, legacyPayload, 0, "lease-1");
        NotificationDeliveryRelay relay = relay(outbox, push, mock(EmailSender.class),
                mock(NotificationSender.class), tokens);

        relay.deliverOne(delivery);

        verify(push, never()).sendToToken(anyString(), anyString(), anyString(), any());
        verify(outbox).markPublished(delivery, null);
    }

    @Test
    void providerFailureSchedulesRetryAndDoesNotMarkPublished() throws Exception {
        NotificationDeliveryOutbox outbox = mock(NotificationDeliveryOutbox.class);
        ExpoPushService push = mock(ExpoPushService.class);
        UserPushTokenRepository tokens = mock(UserPushTokenRepository.class);
        UUID tokenId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        when(tokens.findById(tokenId)).thenReturn(Optional.of(UserPushToken.builder()
                .id(tokenId).userId(userId).token("ExpoPushToken[device]").build()));
        doThrow(new IllegalStateException("provider unavailable"))
                .when(push).sendToToken(eq("ExpoPushToken[device]"),
                        eq(NotificationDeliveryQueue.GENERIC_PUSH_TITLE),
                        eq(NotificationDeliveryQueue.GENERIC_PUSH_BODY), any());
        NotificationDelivery delivery = pushDelivery(new NotificationDeliveryQueue.PushPayload(
                tokenId.toString(), userId.toString(), Map.of()));
        when(outbox.markFailed(eq(delivery), eq(10), any(LocalDateTime.class),
                eq("IllegalStateException"), eq("provider unavailable")))
                .thenReturn(new NotificationDeliveryOutbox.FailureResult(true, false, 1));
        NotificationDeliveryRelay relay = relay(outbox, push, mock(EmailSender.class),
                mock(NotificationSender.class), tokens);

        relay.deliverOne(delivery);

        verify(outbox).markFailed(eq(delivery), eq(10), any(LocalDateTime.class),
                eq("IllegalStateException"), eq("provider unavailable"));
    }

    private NotificationDelivery pushDelivery(NotificationDeliveryQueue.PushPayload payload)
            throws Exception {
        return new NotificationDelivery("delivery-1", "event-1", "tenant-a", null,
                NotificationDeliveryQueue.PUSH, mapper.writeValueAsString(payload), 0, "lease-1");
    }

    private NotificationDeliveryRelay relay(NotificationDeliveryOutbox outbox,
                                             ExpoPushService push,
                                             EmailSender email,
                                             NotificationSender sender,
                                             UserPushTokenRepository tokens) {
        NotificationDeliveryRelay relay = new NotificationDeliveryRelay(
                outbox, push, email, sender, tokens, mapper, new SimpleMeterRegistry());
        ReflectionTestUtils.setField(relay, "batchSize", 100);
        ReflectionTestUtils.setField(relay, "maxAttempts", 10);
        ReflectionTestUtils.setField(relay, "leaseSeconds", 30L);
        return relay;
    }
}
