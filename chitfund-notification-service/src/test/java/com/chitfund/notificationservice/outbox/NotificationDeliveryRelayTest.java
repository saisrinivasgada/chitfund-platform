package com.chitfund.notificationservice.outbox;

import com.chitfund.notificationservice.sender.EmailSender;
import com.chitfund.notificationservice.sender.NotificationSender;
import com.chitfund.notificationservice.service.ExpoPushService;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.LocalDateTime;
import java.util.Map;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class NotificationDeliveryRelayTest {

    @Test
    void successfulEmailIsMarkedPublishedOnlyAfterProviderAcceptsIt() throws Exception {
        NotificationDeliveryOutbox outbox = mock(NotificationDeliveryOutbox.class);
        EmailSender email = mock(EmailSender.class);
        ObjectMapper mapper = new ObjectMapper();
        NotificationDelivery delivery = new NotificationDelivery(
                "delivery-1", "event-1", "tenant-a", null,
                NotificationDeliveryQueue.EMAIL,
                mapper.writeValueAsString(new NotificationDeliveryQueue.EmailPayload(
                        "member@example.com", "Subject", "Text", "<p>Html</p>")),
                0, "lease-1");
        when(outbox.markPublished(delivery, null)).thenReturn(true);
        NotificationDeliveryRelay relay = relay(outbox, mock(ExpoPushService.class),
                email, mock(NotificationSender.class), mapper);

        relay.deliverOne(delivery);

        verify(email).send("member@example.com", "Subject", "Text", "<p>Html</p>");
        verify(outbox).markPublished(delivery, null);
    }

    @Test
    void providerFailureSchedulesRetryAndDoesNotMarkPublished() throws Exception {
        NotificationDeliveryOutbox outbox = mock(NotificationDeliveryOutbox.class);
        ExpoPushService push = mock(ExpoPushService.class);
        ObjectMapper mapper = new ObjectMapper();
        NotificationDelivery delivery = new NotificationDelivery(
                "delivery-1", "event-1", "tenant-a", null,
                NotificationDeliveryQueue.PUSH,
                mapper.writeValueAsString(new NotificationDeliveryQueue.PushPayload(
                        "ExpoPushToken[device]", "Title", "Body", Map.of())),
                0, "lease-1");
        doThrow(new IllegalStateException("provider unavailable"))
                .when(push).sendToToken("ExpoPushToken[device]", "Title", "Body", Map.of());
        when(outbox.markFailed(eq(delivery), eq(10), any(LocalDateTime.class),
                eq("IllegalStateException"), eq("provider unavailable")))
                .thenReturn(new NotificationDeliveryOutbox.FailureResult(true, false, 1));
        NotificationDeliveryRelay relay = relay(outbox, push, mock(EmailSender.class),
                mock(NotificationSender.class), mapper);

        relay.deliverOne(delivery);

        verify(outbox).markFailed(eq(delivery), eq(10), any(LocalDateTime.class),
                eq("IllegalStateException"), eq("provider unavailable"));
    }

    private NotificationDeliveryRelay relay(NotificationDeliveryOutbox outbox,
                                             ExpoPushService push,
                                             EmailSender email,
                                             NotificationSender sender,
                                             ObjectMapper mapper) {
        NotificationDeliveryRelay relay = new NotificationDeliveryRelay(
                outbox, push, email, sender, mapper, new SimpleMeterRegistry());
        ReflectionTestUtils.setField(relay, "batchSize", 100);
        ReflectionTestUtils.setField(relay, "maxAttempts", 10);
        ReflectionTestUtils.setField(relay, "leaseSeconds", 30L);
        return relay;
    }
}
