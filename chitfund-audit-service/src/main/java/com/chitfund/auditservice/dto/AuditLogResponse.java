package com.chitfund.auditservice.dto;

import com.chitfund.auditservice.domain.AuditLog;

import java.time.Instant;

public record AuditLogResponse(
        String id,
        String tenantId,
        String serviceName,
        String entityType,
        String entityId,
        String chitId,
        String action,
        String actorId,
        String actorRole,
        String actorIp,
        String beforeState,
        String afterState,
        String metadata,
        Instant createdAt,
        String correlationId,
        String idempotencyKey,
        String source,
        String outcome,
        String reason,
        String effectiveActorId,
        String effectiveActorRole,
        String deviceSessionHash,
        Instant occurredAt,
        Instant originalOfflineAt,
        Instant synchronizedAt
) {
    public static AuditLogResponse from(AuditLog log) {
        return new AuditLogResponse(
                log.getId(), log.getTenantId(), log.getServiceName(),
                log.getEntityType(), log.getEntityId(), log.getChitId(),
                log.getAction(),
                log.getActorId(), log.getActorRole(), log.getActorIp(),
                log.getBeforeState(), log.getAfterState(), log.getMetadata(),
                log.getCreatedAt(), log.getCorrelationId(), log.getIdempotencyKey(),
                log.getSource(), log.getOutcome(), log.getReason(),
                log.getEffectiveActorId(), log.getEffectiveActorRole(),
                log.getDeviceSessionHash(), log.getOccurredAt(),
                log.getOriginalOfflineAt(), log.getSynchronizedAt()
        );
    }
}
