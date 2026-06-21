package com.chitfund.chitservice.client;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

import java.util.*;

/**
 * Fire-and-forget HTTP client for pushing notifications to payment-service.
 * Errors are logged but never propagate — notification failures must never
 * block chit creation or status changes.
 *
 * INTERVIEW: "Notifications are best-effort auxiliary data. The business transaction
 * (creating a chit, changing its status) is already committed before we send
 * notifications. A failure here never rolls back the main transaction."
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class NotificationClient {

    private final RestTemplate restTemplate;

    @Value("${app.payment-service-url:http://localhost:8084}")
    private String paymentServiceUrl;

    @Value("${app.internal-key:chitfund-internal-service-key}")
    private String internalKey;

    public void sendBulk(List<Map<String, Object>> notifications) {
        if (notifications == null || notifications.isEmpty()) return;
        try {
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            headers.set("X-Internal-Key", internalKey);

            restTemplate.postForObject(
                    paymentServiceUrl + "/notifications/internal/bulk",
                    new HttpEntity<>(notifications, headers),
                    Void.class);
        } catch (RestClientException e) {
            log.warn("Could not deliver notifications to payment-service: {}", e.getMessage());
        }
    }

    // ── Convenience builders ─────────────────────────────────────────────

    public void notifyRole(String role, String type, String title, String message, String entityType, String entityId, String link) {
        sendBulk(List.of(notif(null, role, type, title, message, entityType, entityId, link)));
    }

    public void notifyUsers(List<String> userIds, String type, String title, String message, String entityType, String entityId, String link) {
        List<Map<String, Object>> batch = userIds.stream()
                .map(uid -> notif(uid, null, type, title, message, entityType, entityId, link))
                .toList();
        sendBulk(batch);
    }

    private Map<String, Object> notif(String userId, String role, String type, String title,
                                       String message, String entityType, String entityId, String link) {
        Map<String, Object> m = new HashMap<>();
        if (userId != null)   m.put("recipientUserId", userId);
        if (role != null)     m.put("recipientRole", role);
        m.put("type", type);
        m.put("title", title);
        m.put("message", message);
        if (entityType != null) m.put("entityType", entityType);
        if (entityId != null)   m.put("entityId", entityId);
        if (link != null)       m.put("link", link);
        return m;
    }
}
