package com.chitfund.chitservice.client;

import com.chitfund.common.event.BulkInAppByMemberIdsEvent;
import com.chitfund.common.event.SqsEventEnvelope;
import com.chitfund.common.event.SqsQueues;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.awspring.cloud.sqs.operations.SqsTemplate;
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
 * sendBulk() → payment-service (legacy, role-based push in payment DB)
 * notifyUsersInApp() → SQS NOTIFICATION_EVENTS (notification-service resolves memberIds → userIds)
 * closeDrawsForChit() → payment-service (business operation)
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class NotificationClient {

    private final RestTemplate restTemplate;
    private final SqsTemplate sqsTemplate;
    private final ObjectMapper objectMapper;

    @Value("${app.payment-service-url:http://localhost:8084}")
    private String paymentServiceUrl;

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

    public void notifyUsersInApp(List<String> memberIds, String type, String title,
                                  String message, String link) {
        if (memberIds == null || memberIds.isEmpty()) return;
        try {
            BulkInAppByMemberIdsEvent event = new BulkInAppByMemberIdsEvent(
                    memberIds, type, title, message, null, link);
            String payload  = objectMapper.writeValueAsString(event);
            String envelope = objectMapper.writeValueAsString(
                    new SqsEventEnvelope(UUID.randomUUID().toString(),
                            SqsQueues.EVT_BULK_IN_APP_BY_MEMBER_IDS, payload));
            sqsTemplate.send(SqsQueues.NOTIFICATION_EVENTS, envelope);
            log.info("Queued bulk in-app notification '{}' for {} member(s)", type, memberIds.size());
        } catch (Exception e) {
            log.warn("Could not queue bulk in-app notification: {}", e.getMessage());
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
