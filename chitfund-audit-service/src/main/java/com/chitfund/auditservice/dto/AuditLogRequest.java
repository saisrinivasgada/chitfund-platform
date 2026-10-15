package com.chitfund.auditservice.dto;

import jakarta.validation.constraints.NotBlank;

import java.time.Instant;

/**
 * Payload posted by other services to record an audit event.
 *
 * actorId / actorRole / actorIp are optional because some system-initiated
 * actions (e.g. scheduled jobs) have no human actor.
 *
 * beforeState / afterState are JSON strings serialized by the calling service.
 * The audit-service treats them as opaque text — no parsing needed here.
 */
public record AuditLogRequest(
        @NotBlank String serviceName,
        @NotBlank String entityType,
        @NotBlank String entityId,
        String chitId,
        @NotBlank String action,
        String actorId,
        String actorRole,
        String actorIp,
        String beforeState,
        String afterState,
        String metadata,
        @NotBlank String tenantId,
        String eventId,
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
    public AuditLogRequest(String serviceName, String entityType, String entityId, String chitId,
                           String action, String actorId, String actorRole, String actorIp,
                           String beforeState, String afterState, String metadata, String tenantId) {
        this(serviceName, entityType, entityId, chitId, action, actorId, actorRole, actorIp,
                beforeState, afterState, metadata, tenantId, null, null, null, null,
                "SUCCESS", null, null, null, null, null, null, null);
    }
}
