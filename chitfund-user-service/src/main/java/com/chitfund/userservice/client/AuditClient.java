package com.chitfund.userservice.client;

import com.chitfund.common.event.AuditLogEvent;
import com.chitfund.common.event.SqsQueues;
import com.chitfund.common.outbox.DurableAuditOutbox;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import com.chitfund.userservice.domain.entity.User;

import java.util.Objects;
import java.util.UUID;
import java.time.Instant;

@Component
@RequiredArgsConstructor
public class AuditClient {

    private final DurableAuditOutbox outbox;
    private final ObjectMapper objectMapper;

    public void log(String entityType, String entityId,
                    String action, String actorId, String actorRole,
                    Object before, Object after, String tenantId) {
        log(entityType, entityId, action, actorId, actorRole, before, after, tenantId, null);
    }

    public void log(String entityType, String entityId,
                    String action, String actorId, String actorRole,
                    Object before, Object after, String tenantId, String reason) {
        requireBusinessTransaction();
        try {
            String eventId = UUID.randomUUID().toString();
            String resolvedActorId = resolveActorId(actorId);
            AuditLogEvent event = new AuditLogEvent(
                    "user-service", entityType, entityId, null,
                    action, resolvedActorId, actorRole, null,
                    before != null ? objectMapper.writeValueAsString(before) : null,
                    after != null ? objectMapper.writeValueAsString(after) : null,
                    null, tenantId, null, null, "UNKNOWN", "SUCCESS", reason,
                    null, null, null, Instant.now(), null, null);
            outbox.enqueue(eventId, Objects.requireNonNull(tenantId, "tenantId"),
                    entityType, entityId, objectMapper.writeValueAsString(event), SqsQueues.AUDIT_EVENTS);
        } catch (Exception exception) {
            throw new IllegalStateException(
                    "Could not record the user audit event in the business transaction", exception);
        }
    }

    private static void requireBusinessTransaction() {
        if (!TransactionSynchronizationManager.isActualTransactionActive()) {
            throw new IllegalStateException(
                    "A user audit event must be recorded inside the business transaction");
        }
    }

    private String resolveActorId(String explicitActorId) {
        if (explicitActorId != null && !explicitActorId.isBlank()) return explicitActorId;
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !authentication.isAuthenticated()) return null;
        Object principal = authentication.getPrincipal();
        if (principal instanceof User user && user.getId() != null) {
            return user.getId().toString();
        }
        if (principal instanceof UUID id) return id.toString();
        if (principal instanceof String value && !"anonymousUser".equals(value)) return value;
        return null;
    }
}
