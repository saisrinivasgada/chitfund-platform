package com.chitfund.userservice.event;

import com.chitfund.common.event.InAppNotificationEvent;
import com.chitfund.common.event.PushNotificationEvent;
import com.chitfund.common.event.SqsQueues;
import com.chitfund.common.event.TransactionalEmailEvent;
import com.chitfund.common.outbox.DurableEventOutbox;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.UUID;

@Component
@RequiredArgsConstructor
public class NotificationEventPublisher {

    private final DurableEventOutbox outbox;
    private final ObjectMapper objectMapper;

    public void publishInApp(String tenantId, UUID recipientId, String title, String message,
                             String type, Map<String, String> metadata, String link) {
        publish(SqsQueues.EVT_IN_APP_NOTIFICATION,
                new InAppNotificationEvent(tenantId, recipientId.toString(), title, message, type, metadata, link));
    }

    public void publishPush(String tenantId, UUID userId, String title, String body,
                            Map<String, String> data) {
        publish(SqsQueues.EVT_PUSH_NOTIFICATION,
                new PushNotificationEvent(tenantId, userId.toString(), title, body, data));
    }

    public void publishEmail(String toEmail, String subject, String htmlBody, String textBody) {
        publish(SqsQueues.EVT_TRANSACTIONAL_EMAIL,
                new TransactionalEmailEvent(toEmail, subject, htmlBody, textBody));
    }

    private void publish(String eventType, Object payload) {
        String eventId = UUID.randomUUID().toString();
        try {
            outbox.enqueue(eventId, eventType, objectMapper.writeValueAsString(payload),
                    SqsQueues.NOTIFICATION_EVENTS);
        } catch (Exception e) {
            throw new IllegalStateException("Could not persist " + eventType + " event", e);
        }
    }
}
