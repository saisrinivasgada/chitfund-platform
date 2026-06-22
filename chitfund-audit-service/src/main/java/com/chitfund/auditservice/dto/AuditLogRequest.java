package com.chitfund.auditservice.dto;

import jakarta.validation.constraints.NotBlank;

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
        String metadata
) {}
