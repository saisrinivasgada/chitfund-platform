package com.chitfund.userservice.event;

import com.chitfund.common.event.InAppNotificationEvent;
import com.chitfund.common.event.PushNotificationEvent;
import com.chitfund.common.event.SqsEventEnvelope;
import com.chitfund.common.event.SqsQueues;
import com.chitfund.common.event.TransactionalEmailEvent;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.awspring.cloud.sqs.operations.SqsTemplate;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.UUID;

@Component
@RequiredArgsConstructor
@Slf4j
public class NotificationEventPublisher {

    private final SqsTemplate sqsTemplate;
    private final ObjectMapper objectMapper;

    public void publishInApp(UUID recipientId, String title, String message,
                             String type, Map<String, String> metadata, String link) {
        publish(SqsQueues.EVT_IN_APP_NOTIFICATION,
                new InAppNotificationEvent(recipientId.toString(), title, message, type, metadata, link));
    }

    public void publishPush(UUID userId, String title, String body, Map<String, String> data) {
        publish(SqsQueues.EVT_PUSH_NOTIFICATION,
                new PushNotificationEvent(userId.toString(), title, body, data));
    }

    public void publishEmail(String toEmail, String subject, String htmlBody, String textBody) {
        publish(SqsQueues.EVT_TRANSACTIONAL_EMAIL,
                new TransactionalEmailEvent(toEmail, subject, htmlBody, textBody));
    }

    private void publish(String eventType, Object payload) {
        try {
            String payloadJson = objectMapper.writeValueAsString(payload);
            String envelopeJson = objectMapper.writeValueAsString(
                    new SqsEventEnvelope(UUID.randomUUID().toString(), eventType, payloadJson));
            sqsTemplate.send(SqsQueues.NOTIFICATION_EVENTS, envelopeJson);
        } catch (Exception e) {
            log.error("Failed to publish {} event to SQS: {}", eventType, e.getMessage(), e);
        }
    }
}
