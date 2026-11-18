package com.chitfund.notificationservice.outbox;

import com.chitfund.notificationservice.domain.UserPushToken;
import com.chitfund.notificationservice.domain.enums.NotificationChannel;
import com.chitfund.notificationservice.repository.UserPushTokenRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class NotificationDeliveryQueueTest {

    @Mock NotificationDeliveryOutbox outbox;
    @Mock UserPushTokenRepository tokenRepository;

    @Test
    void oneDurableDeliveryIsQueuedPerExpoDeviceWithStableDedupeKeys() {
        UUID userId = UUID.randomUUID();
        when(tokenRepository.findByUserId(userId)).thenReturn(List.of(
                UserPushToken.builder().id(UUID.randomUUID()).token("ExponentPushToken[device-a]").build(),
                UserPushToken.builder().id(UUID.randomUUID()).token("invalid-token").build(),
                UserPushToken.builder().id(UUID.randomUUID()).token("ExpoPushToken[device-b]").build()));
        when(outbox.enqueue(any(), any(), any(), any(), any(), any())).thenReturn(true);
        var queue = new NotificationDeliveryQueue(outbox, tokenRepository, new ObjectMapper());

        assertThat(queue.enqueuePush("11111111-1111-1111-1111-111111111111",
                "tenant-a", userId, "Title", "Body", Map.of("screen", "payments")))
                .isEqualTo(2);

        ArgumentCaptor<String> dedupeKeys = ArgumentCaptor.forClass(String.class);
        verify(outbox, times(2)).enqueue(
                eq("11111111-1111-1111-1111-111111111111"), dedupeKeys.capture(),
                eq("tenant-a"), eq(null), eq(NotificationDeliveryQueue.PUSH), any());
        assertThat(dedupeKeys.getAllValues()).doesNotHaveDuplicates();
    }

    @Test
    void pushPayloadStoresTokenReferenceAndNeverTheRawTokenOrSensitiveCopy() {
        UUID userId = UUID.randomUUID();
        UUID tokenId = UUID.randomUUID();
        when(tokenRepository.findByUserId(userId)).thenReturn(List.of(
                UserPushToken.builder().id(tokenId).token("ExpoPushToken[device-a]").build()));
        when(outbox.enqueue(any(), any(), any(), any(), any(), any())).thenReturn(true);
        var queue = new NotificationDeliveryQueue(outbox, tokenRepository, new ObjectMapper());

        queue.enqueuePush("11111111-1111-1111-1111-111111111111", "tenant-a", userId,
                "Payout of Rs 50,000 is ready", "Member Ramesh won the draw",
                Map.of("screen", "payouts", "chitId", "chit-9", "amount", "50000"));

        ArgumentCaptor<String> payload = ArgumentCaptor.forClass(String.class);
        verify(outbox).enqueue(any(), any(), eq("tenant-a"), eq(null),
                eq(NotificationDeliveryQueue.PUSH), payload.capture());
        String json = payload.getValue();
        // Token reference + intended user, no frozen raw token.
        assertThat(json).contains(tokenId.toString()).contains(userId.toString());
        assertThat(json).doesNotContain("ExpoPushToken");
        // No sensitive lock-screen copy is persisted.
        assertThat(json).doesNotContain("Payout").doesNotContain("Ramesh").doesNotContain("50000");
        // Only the destination survives; the signed-in app loads record details.
        assertThat(json).contains("payouts");
        assertThat(json).doesNotContain("amount").doesNotContain("chit-9");
    }

    @Test
    void tokensWithoutARowIdAreNotQueued() {
        UUID userId = UUID.randomUUID();
        when(tokenRepository.findByUserId(userId)).thenReturn(List.of(
                UserPushToken.builder().token("ExpoPushToken[device-a]").build()));
        var queue = new NotificationDeliveryQueue(outbox, tokenRepository, new ObjectMapper());

        assertThat(queue.enqueuePush("11111111-1111-1111-1111-111111111111",
                "tenant-a", userId, "Title", "Body", Map.of())).isZero();
    }

    @Test
    void replayKeepsSameDedupeKeyIfDeviceRowWasRecreated() {
        UUID userId = UUID.randomUUID();
        String expoToken = "ExpoPushToken[same-device]";
        when(tokenRepository.findByUserId(userId)).thenReturn(
                List.of(UserPushToken.builder().id(UUID.randomUUID()).token(expoToken).build()),
                List.of(UserPushToken.builder().id(UUID.randomUUID()).token(expoToken).build()));
        when(outbox.enqueue(any(), any(), any(), any(), any(), any())).thenReturn(true);
        var queue = new NotificationDeliveryQueue(outbox, tokenRepository, new ObjectMapper());

        queue.enqueuePush("11111111-1111-1111-1111-111111111111", "tenant-a", userId,
                "Title", "Body", Map.of("screen", "payments"));
        queue.enqueuePush("11111111-1111-1111-1111-111111111111", "tenant-a", userId,
                "Title", "Body", Map.of("screen", "payments"));

        ArgumentCaptor<String> dedupeKeys = ArgumentCaptor.forClass(String.class);
        verify(outbox, times(2)).enqueue(any(), dedupeKeys.capture(), any(), any(), any(), any());
        assertThat(dedupeKeys.getAllValues()).hasSize(2);
        assertThat(dedupeKeys.getAllValues().get(0)).isEqualTo(dedupeKeys.getAllValues().get(1));
    }

    @Test
    void channelDeliveryLinksBackToNotificationHistory() {
        when(outbox.enqueue(any(), any(), any(), any(), any(), any())).thenReturn(true);
        var queue = new NotificationDeliveryQueue(outbox, tokenRepository, new ObjectMapper());
        UUID notificationId = UUID.randomUUID();
        UUID recipientId = UUID.randomUUID();

        assertThat(queue.enqueueChannel("22222222-2222-2222-2222-222222222222",
                "tenant-a", notificationId, recipientId, "+919999999999",
                "Payment received", NotificationChannel.SMS)).isTrue();

        verify(outbox).enqueue(eq("22222222-2222-2222-2222-222222222222"), any(),
                eq("tenant-a"), eq(notificationId.toString()),
                eq(NotificationDeliveryQueue.CHANNEL), any());
    }
}
