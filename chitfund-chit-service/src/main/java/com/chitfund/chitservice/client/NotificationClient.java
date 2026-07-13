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
 * Fire-and-forget HTTP client for pushing notifications.
 * sendBulk() → payment-service (legacy, for role-based push in payment DB)
 * notifyUsersInApp() → notification-service (in-app bell notifications by member IDs)
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class NotificationClient {

    private final RestTemplate restTemplate;

    @Value("${app.payment-service-url:http://localhost:8084}")
    private String paymentServiceUrl;

    @Value("${app.notification-service-url:http://localhost:8086}")
    private String notificationServiceUrl;

    @Value("${app.internal-key:chitfund-internal-service-key}")
    private String internalKey;

    public void closeDrawsForChit(java.util.UUID chitId) {
        try {
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            headers.set("X-Internal-Key", internalKey);
            restTemplate.postForObject(
                    paymentServiceUrl + "/admin/draws/internal/close-for-chit/" + chitId,
                    new HttpEntity<>(null, headers),
                    Void.class);
        } catch (RestClientException e) {
            log.warn("Could not close draws for completed chit {}: {}", chitId, e.getMessage());
        }
    }

    /**
     * Push in-app notifications to all members in a chit by their member profile IDs.
     * notification-service resolves memberIds → userIds internally via member-service.
     */
    public void notifyUsersInApp(List<String> memberIds, String type, String title,
                                  String message, String link) {
        if (memberIds == null || memberIds.isEmpty()) return;
        try {
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            headers.set("X-Internal-Key", internalKey);

            Map<String, Object> body = new HashMap<>();
            body.put("memberIds", memberIds);
            body.put("type", type);
            body.put("title", title);
            body.put("message", message);
            if (link != null) body.put("link", link);

            restTemplate.postForObject(
                    notificationServiceUrl + "/internal/notify/in-app/bulk-by-member-ids",
                    new HttpEntity<>(body, headers),
                    Void.class);
            log.info("Sent in-app notification '{}' to {} member(s)", type, memberIds.size());
        } catch (RestClientException e) {
            log.warn("Could not deliver in-app notifications to notification-service: {}", e.getMessage());
        }
    }

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

    public void notifyRole(String role, String type, String title, String message,
                            String entityType, String entityId, String link) {
        sendBulk(List.of(notif(null, role, type, title, message, entityType, entityId, link)));
    }

    public void notifyUsers(List<String> userIds, String type, String title, String message,
                             String entityType, String entityId, String link) {
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
