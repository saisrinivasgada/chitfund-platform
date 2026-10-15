package com.chitfund.notificationservice.service;

import com.chitfund.common.context.TenantContext;
import com.chitfund.notificationservice.domain.InAppNotification;
import com.chitfund.notificationservice.dto.response.InAppNotificationResponse;
import com.chitfund.notificationservice.repository.InAppNotificationRepository;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Map;
import java.util.Set;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Slf4j
public class InAppNotificationService {

    private static final Set<String> PLATFORM_SCOPED_TYPES = Set.of(
            "RENEWAL_REQUEST", "ACCOUNT_ACCESS");

    private final InAppNotificationRepository repo;
    private final ObjectMapper objectMapper;

    /**
     * Create and persist a new in-app notification for a recipient.
     *
     * Native push is deliberately a separate operation. Event producers expose
     * distinct IN_APP_NOTIFICATION and PUSH_NOTIFICATION commands, and domain
     * handlers that need both call the push service once with their deep-link
     * payload. Sending here as well caused every such handler to deliver two
     * native pushes for one business event.
     */
    public void create(String tenantId, UUID recipientId, String title, String message,
                       String type, Map<String, String> metadata, String link) {
        try {
            String metaJson = metadata != null ? objectMapper.writeValueAsString(metadata) : null;
            InAppNotification n = InAppNotification.builder()
                    .tenantId(resolveScope(tenantId, type))
                    .recipientId(recipientId)
                    .title(title)
                    .message(message)
                    .type(type)
                    .metadata(metaJson)
                    .link(link)
                    .build();
            repo.save(n);
        } catch (JsonProcessingException e) {
            // Do not acknowledge the queue event without its durable in-app
            // notification. Throwing rolls back the consumer inbox claim so SQS
            // can retry instead of silently losing the notification.
            throw new IllegalStateException("Could not serialize notification metadata", e);
        }
    }

    public Page<InAppNotificationResponse> getForUser(UUID recipientId, int page, int size) {
        String tenantId = requireTenantContext();
        Pageable pageable = PageRequest.of(page, size);
        return repo.findVisibleForRecipient(tenantId, recipientId, pageable)
                   .map(InAppNotificationResponse::from);
    }

    public long getUnreadCount(UUID recipientId) {
        return repo.countUnreadVisibleForRecipient(requireTenantContext(), recipientId);
    }

    @Transactional
    public void markRead(UUID notificationId, UUID recipientId) {
        repo.findVisibleById(notificationId, requireTenantContext(), recipientId).ifPresent(n -> {
            n.setRead(true);
            repo.save(n);
        });
    }

    @Transactional
    public int markAllRead(UUID recipientId) {
        return repo.markAllReadByRecipient(requireTenantContext(), recipientId);
    }

    private String requireTenantContext() {
        String tenantId = TenantContext.get();
        if (tenantId == null || tenantId.isBlank()) {
            throw new IllegalStateException("Organization context is required for notifications");
        }
        return tenantId;
    }

    private String resolveScope(String tenantId, String type) {
        if (tenantId != null && !tenantId.isBlank()) return tenantId;
        if (PLATFORM_SCOPED_TYPES.contains(type)) return null;
        throw new IllegalArgumentException("tenantId is required for organization notification type " + type);
    }
}
