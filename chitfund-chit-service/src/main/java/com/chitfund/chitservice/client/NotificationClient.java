package com.chitfund.chitservice.client;

import com.chitfund.common.event.BulkInAppByMemberIdsEvent;
import com.chitfund.common.event.SqsQueues;
import com.chitfund.common.outbox.DurableEventOutbox;
import com.fasterxml.jackson.databind.ObjectMapper;
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
    private final DurableEventOutbox eventOutbox;
    private final ObjectMapper objectMapper;

    @Value("${app.payment-service-url:http://localhost:8084}")
    private String paymentServiceUrl;

    @Value("${app.internal-key:chitfund-internal-service-key}")
    private String internalKey;

    public com.chitfund.common.dto.DrawSkipResult skipDraw(com.chitfund.common.dto.DrawSkipCommand command, String tenantId) {
        HttpHeaders headers = new HttpHeaders(); headers.setContentType(MediaType.APPLICATION_JSON);
        headers.set("X-Internal-Key", internalKey); headers.set("X-Tenant-ID", requireTenant(tenantId));
        var result = restTemplate.postForObject(paymentServiceUrl + "/admin/draws/internal/skip-command",
                new HttpEntity<>(command, headers), com.chitfund.common.dto.DrawSkipResult.class);
        if (result == null || !command.commandId().equals(result.commandId())
                || !command.fingerprint().equals(result.requestHash())
                || !("APPLIED".equals(result.status()) || "REJECTED".equals(result.status())))
            throw new IllegalStateException("Payment service returned an unverified skip decision");
        return result;
    }

    public void closeDrawsForChit(java.util.UUID chitId, String tenantId) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.set("X-Internal-Key", internalKey);
        headers.set("X-Tenant-ID", requireTenant(tenantId));
        // Deliberately propagate failures: the durable lifecycle worker owns retry.
        restTemplate.postForObject(
                paymentServiceUrl + "/admin/draws/internal/close-for-chit/" + chitId,
                new HttpEntity<>(null, headers),
                Void.class);
    }

    public void notifyUsersInApp(List<String> memberIds, String type, String title,
                                  String message, String link) {
        notifyUsersInApp(requireTenantContext(), memberIds, type, title, message, link);
    }

    public void notifyUsersInApp(String tenantId, List<String> memberIds, String type, String title,
                                 String message, String link) {
        if (memberIds == null || memberIds.isEmpty()) return;
        try {
            BulkInAppByMemberIdsEvent event = new BulkInAppByMemberIdsEvent(
                    requireTenant(tenantId), memberIds, type, title, message, null, link);
            eventOutbox.enqueue(UUID.randomUUID().toString(),
                    SqsQueues.EVT_BULK_IN_APP_BY_MEMBER_IDS,
                    objectMapper.writeValueAsString(event), SqsQueues.NOTIFICATION_EVENTS);
            log.info("Persisted bulk in-app notification '{}' for {} member(s)", type, memberIds.size());
        } catch (Exception e) {
            throw new IllegalStateException("Could not persist bulk in-app notification", e);
        }
    }

    private String requireTenantContext() {
        String tenantId = com.chitfund.common.context.TenantContext.get();
        if (tenantId == null || tenantId.isBlank()) {
            throw new IllegalStateException("Organization context is required for notifications");
        }
        return tenantId;
    }

    /** Persist the notification in the surrounding business transaction. */
    public void notifyUsersInAppDurably(List<String> memberIds, String type, String title,
                                        String message, String link) {
        notifyUsersInApp(requireTenantContext(), memberIds, type, title, message, link);
    }

    public void sendBulk(String tenantId, List<Map<String, Object>> notifications) {
        if (notifications == null || notifications.isEmpty()) return;
        try {
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            headers.set("X-Internal-Key", internalKey);
            headers.set("X-Tenant-ID", requireTenant(tenantId));

            restTemplate.postForObject(
                    paymentServiceUrl + "/notifications/internal/bulk",
                    new HttpEntity<>(notifications, headers),
                    Void.class);
        } catch (RestClientException e) {
            log.warn("Could not deliver notifications to payment-service: {}", e.getMessage());
        }
    }

    public void notifyRole(String tenantId, String role, String type, String title, String message,
                            String entityType, String entityId, String link) {
        sendBulk(tenantId, List.of(notif(null, role, type, title, message, entityType, entityId, link)));
    }

    public void notifyUsers(String tenantId, List<String> userIds, String type, String title, String message,
                             String entityType, String entityId, String link) {
        List<Map<String, Object>> batch = userIds.stream()
                .map(uid -> notif(uid, null, type, title, message, entityType, entityId, link))
                .toList();
        sendBulk(tenantId, batch);
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

    private String requireTenant(String tenantId) {
        if (tenantId == null || tenantId.isBlank()) {
            throw new IllegalStateException("Organization context is required for notifications");
        }
        return tenantId;
    }
}
