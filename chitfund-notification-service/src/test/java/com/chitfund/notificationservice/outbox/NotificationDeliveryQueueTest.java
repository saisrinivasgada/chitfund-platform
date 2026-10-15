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
                UserPushToken.builder().token("ExponentPushToken[device-a]").build(),
                UserPushToken.builder().token("invalid-token").build(),
                UserPushToken.builder().token("ExpoPushToken[device-b]").build()));
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
