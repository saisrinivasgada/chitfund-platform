package com.chitfund.paymentservice.service;

import com.chitfund.common.context.TenantContext;
import com.chitfund.common.exception.BusinessException;
import com.chitfund.common.exception.ErrorCode;
import com.chitfund.paymentservice.domain.Notification;
import com.chitfund.paymentservice.domain.enums.NotificationType;
import com.chitfund.paymentservice.dto.request.CreateNotifRequest;
import com.chitfund.paymentservice.dto.response.NotificationResponse;
import com.chitfund.paymentservice.repository.NotificationRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class NotificationService {

    private final NotificationRepository repository;
    private final JdbcTemplate jdbc;

    // ── Convenience builders ─────────────────────────────────────────────────

    public void notifyUser(UUID userId, NotificationType type, String title, String message,
                           String entityType, UUID entityId, String link) {
        save(CreateNotifRequest.builder()
                .recipientUserId(userId).type(type).title(title).message(message)
                .entityType(entityType).entityId(entityId).link(link).build(), tenantId());
    }

    public void notifyRole(String role, NotificationType type, String title, String message,
                           String entityType, UUID entityId, String link) {
        save(CreateNotifRequest.builder()
                .recipientRole(role).type(type).title(title).message(message)
                .entityType(entityType).entityId(entityId).link(link).build(), tenantId());
    }

    public void notifyUsers(List<UUID> userIds, NotificationType type, String title, String message,
                            String entityType, UUID entityId, String link) {
        String tenantId = tenantId();
        List<Notification> entities = userIds.stream().map(uid ->
                build(CreateNotifRequest.builder()
                        .recipientUserId(uid).type(type).title(title).message(message)
                        .entityType(entityType).entityId(entityId).link(link).build(), tenantId)
        ).toList();
        repository.saveAll(entities);
    }

    @Transactional
    public void createBulk(List<CreateNotifRequest> requests, String tenantId) {
        requireTenant(tenantId);
        repository.saveAll(requests.stream().map(request -> build(request, tenantId)).toList());
    }

    // ── Read operations ──────────────────────────────────────────────────────

    public List<NotificationResponse> getForUser(UUID userId, String role) {
        List<Notification> notifs = repository.findLatestForUser(tenantId(), userId.toString(), role);
        if (notifs.isEmpty()) return List.of();

        List<UUID> ids = notifs.stream().map(Notification::getId).toList();
        Set<UUID> readIds = fetchReadIds(userId, ids);

        return notifs.stream().map(n -> NotificationResponse.builder()
                .id(n.getId())
                .type(n.getType())
                .title(n.getTitle())
                .message(n.getMessage())
                .entityType(n.getEntityType())
                .entityId(n.getEntityId())
                .link(n.getLink())
                .read(readIds.contains(n.getId()))
                .createdAt(n.getCreatedAt())
                .build()
        ).toList();
    }

    public long countUnread(UUID userId, String role) {
        return repository.countUnread(tenantId(), userId.toString(), role);
    }

    @Transactional
    public void markRead(UUID notificationId, UUID userId, String role) {
        Notification notification = repository.findByIdAndTenantId(notificationId, tenantId())
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND,
                        "Notification not found", HttpStatus.NOT_FOUND));
        boolean addressedToUser = userId.equals(notification.getRecipientUserId());
        boolean addressedToRole = role != null && role.equals(notification.getRecipientRole());
        if (!addressedToUser && !addressedToRole) {
            throw new BusinessException(ErrorCode.RESOURCE_NOT_FOUND,
                    "Notification not found", HttpStatus.NOT_FOUND);
        }
        jdbc.update(
                "INSERT IGNORE INTO notification_reads (user_id, notification_id, read_at) VALUES (?, ?, ?)",
                userId.toString(), notificationId.toString(), LocalDateTime.now()
        );
    }

    @Transactional
    public void markAllRead(UUID userId, String role) {
        List<Notification> notifs = repository.findLatestForUser(tenantId(), userId.toString(), role);
        notifs.forEach(n -> jdbc.update(
                "INSERT IGNORE INTO notification_reads (user_id, notification_id, read_at) VALUES (?, ?, ?)",
                userId.toString(), n.getId().toString(), LocalDateTime.now()
        ));
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    @Transactional
    void save(CreateNotifRequest req, String tenantId) {
        repository.save(build(req, tenantId));
    }

    private Notification build(CreateNotifRequest req, String tenantId) {
        requireTenant(tenantId);
        return Notification.builder()
                .tenantId(tenantId)
                .recipientUserId(req.getRecipientUserId())
                .recipientRole(req.getRecipientRole())
                .type(req.getType())
                .title(req.getTitle())
                .message(req.getMessage())
                .entityType(req.getEntityType())
                .entityId(req.getEntityId())
                .link(req.getLink())
                .build();
    }

    private Set<UUID> fetchReadIds(UUID userId, List<UUID> notifIds) {
        if (notifIds.isEmpty()) return Set.of();
        String placeholders = String.join(",", Collections.nCopies(notifIds.size(), "?"));
        List<Object> params = new ArrayList<>();
        params.add(userId.toString());
        notifIds.forEach(id -> params.add(id.toString()));
        return jdbc.queryForList(
                "SELECT notification_id FROM notification_reads WHERE user_id = ? AND notification_id IN (" + placeholders + ")",
                String.class, params.toArray()
        ).stream().map(UUID::fromString).collect(Collectors.toSet());
    }

    private String tenantId() {
        return requireTenant(TenantContext.get());
    }

    private String requireTenant(String tenantId) {
        if (tenantId == null || tenantId.isBlank()) {
            throw new BusinessException(ErrorCode.FORBIDDEN,
                    "Organization context is required", HttpStatus.FORBIDDEN);
        }
        return tenantId;
    }
}
