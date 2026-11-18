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
import java.util.Set;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class NotificationDeliveryQueue {

    public static final String PUSH = "PUSH";
    public static final String EMAIL = "EMAIL";
    public static final String CHANNEL = "CHANNEL";

    /**
     * Lock-screen copy is intentionally generic. The sensitive title/body the
     * caller builds (amounts, member names, chit details) is never persisted in
     * the outbox nor sent to Expo — only this neutral text reaches the device.
     */
    public static final String GENERIC_PUSH_TITLE = "ChitWise";
    public static final String GENERIC_PUSH_BODY = "You have a new update";

    /**
     * Only a known destination survives into the stored payload. The mobile app
     * routes by screen; identifiers and amounts are loaded after authentication.
     */
    private static final Set<String> ALLOWED_SCREENS = Set.of(
            "reminders", "chits", "payments", "payouts", "requests",
            "tasks", "account", "messages", "support");

    private final NotificationDeliveryOutbox outbox;
    private final UserPushTokenRepository pushTokenRepository;
    private final ObjectMapper objectMapper;

    @Transactional
    public int enqueuePush(String eventId, String tenantId, UUID userId,
                           String title, String body, Map<String, String> data) {
        // title/body are deliberately not persisted — see GENERIC_PUSH_* above.
        String stableEventId = stableEventId(eventId);
        Map<String, String> navigation = navigationMetadata(data);
        int queued = 0;
        for (var token : pushTokenRepository.findByUserId(userId)) {
            if (!isExpoToken(token.getToken())) continue;
            if (token.getId() == null) continue; // cannot address a token row without its id
            String tokenId = token.getId().toString();
            PushPayload payload = new PushPayload(tokenId, userId.toString(), navigation);
            if (outbox.enqueue(stableEventId,
                    // Keep the original token-based dedupe fingerprint stable if a
                    // device row is deleted and recreated before event replay.
                    dedupeKey(stableEventId, PUSH, token.getToken()), tenantId,
                    null, PUSH, json(payload))) {
                queued++;
            }
        }
        return queued;
    }

    static Map<String, String> navigationMetadata(Map<String, String> data) {
        String screen = data == null ? null : data.get("screen");
        return screen != null && ALLOWED_SCREENS.contains(screen)
                ? Map.of("screen", screen) : Map.of();
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

    /**
     * Identifies a device by token row id and the user it belonged to at enqueue
     * time. The raw Expo token is resolved from {@code tokenId} at relay time and
     * only sent if the row still belongs to {@code userId}. {@code data} carries
     * allowlisted navigation hints only.
     */
    public record PushPayload(String tokenId, String userId,
                              Map<String, String> data) { }

    public record EmailPayload(String toEmail, String subject, String textBody,
                               String htmlBody) { }

    public record ChannelPayload(String to, String message,
                                 NotificationChannel channel) { }
}
