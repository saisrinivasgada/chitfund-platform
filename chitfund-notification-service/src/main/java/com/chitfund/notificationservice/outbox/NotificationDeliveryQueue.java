package com.chitfund.notificationservice.outbox;

import com.chitfund.notificationservice.domain.enums.NotificationChannel;
import com.chitfund.notificationservice.repository.UserPushTokenRepository;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.Map;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class NotificationDeliveryQueue {

    public static final String PUSH = "PUSH";
    public static final String EMAIL = "EMAIL";
    public static final String CHANNEL = "CHANNEL";

    private final NotificationDeliveryOutbox outbox;
    private final UserPushTokenRepository pushTokenRepository;
    private final ObjectMapper objectMapper;

    @Transactional
    public int enqueuePush(String eventId, String tenantId, UUID userId,
                           String title, String body, Map<String, String> data) {
        String stableEventId = stableEventId(eventId);
        int queued = 0;
        for (var token : pushTokenRepository.findByUserId(userId)) {
            if (!isExpoToken(token.getToken())) continue;
            PushPayload payload = new PushPayload(token.getToken(), title, body,
                    data == null ? Map.of() : data);
            if (outbox.enqueue(stableEventId,
                    dedupeKey(stableEventId, PUSH, token.getToken()), tenantId,
                    null, PUSH, json(payload))) {
                queued++;
            }
        }
        return queued;
    }

    @Transactional
    public boolean enqueueEmail(String eventId, String tenantId, String toEmail,
                                String subject, String textBody, String htmlBody) {
        String stableEventId = stableEventId(eventId);
        return outbox.enqueue(stableEventId,
                dedupeKey(stableEventId, EMAIL, toEmail), tenantId, null, EMAIL,
                json(new EmailPayload(toEmail, subject, textBody, htmlBody)));
    }

    @Transactional
    public boolean enqueueChannel(String eventId, String tenantId, UUID notificationId,
                                  UUID recipientId, String to, String message,
                                  NotificationChannel channel) {
        String stableEventId = stableEventId(eventId);
        String identity = recipientId + ":" + channel;
        return outbox.enqueue(stableEventId,
                dedupeKey(stableEventId, CHANNEL, identity), tenantId,
                notificationId.toString(), CHANNEL,
                json(new ChannelPayload(to, message, channel)));
    }

    private String stableEventId(String eventId) {
        if (eventId == null || eventId.isBlank()) return UUID.randomUUID().toString();
        return UUID.fromString(eventId).toString();
    }

    private boolean isExpoToken(String token) {
        return token != null && (token.startsWith("ExponentPushToken")
                || token.startsWith("ExpoPushToken"));
    }

    private String dedupeKey(String eventId, String deliveryType, String identity) {
        return eventId + ":" + deliveryType + ":" + sha256(identity);
    }

    private String sha256(String value) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException impossible) {
            throw new IllegalStateException("SHA-256 is unavailable", impossible);
        }
    }

    private String json(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Notification delivery could not be serialized", exception);
        }
    }

    public record PushPayload(String token, String title, String body,
                              Map<String, String> data) { }

    public record EmailPayload(String toEmail, String subject, String textBody,
                               String htmlBody) { }

    public record ChannelPayload(String to, String message,
                                 NotificationChannel channel) { }
}
