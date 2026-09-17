package com.chitfund.common.event;

public record AuditLogEvent(
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
        String tenantId
) {}
