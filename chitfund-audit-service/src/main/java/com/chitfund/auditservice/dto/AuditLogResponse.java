package com.chitfund.auditservice.dto;

import com.chitfund.auditservice.domain.AuditLog;

import java.time.Instant;

public record AuditLogResponse(
        String id,
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
        Instant createdAt
) {
    public static AuditLogResponse from(AuditLog log) {
        return new AuditLogResponse(
                log.getId(), log.getServiceName(),
                log.getEntityType(), log.getEntityId(), log.getChitId(),
                log.getAction(),
                log.getActorId(), log.getActorRole(), log.getActorIp(),
                log.getBeforeState(), log.getAfterState(), log.getMetadata(),
                log.getCreatedAt()
        );
    }
}
