package com.chitfund.auditservice.controller;

import com.chitfund.auditservice.dto.AuditLogResponse;
import com.chitfund.auditservice.service.AuditService;
import com.chitfund.common.dto.ApiResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;

/**
 * Admin-only read side. Workers and members cannot see audit trails —
 * audit logs contain before/after state snapshots that may include sensitive data.
 */
@RestController
@RequestMapping("/audit")
@RequiredArgsConstructor
@PreAuthorize("hasAnyRole('ROLE_ADMIN', 'ROLE_MANAGER')")
public class AuditQueryController {

    private final AuditService auditService;

    /**
     * General-purpose search. All query params are optional.
     * Example: GET /audit/logs?chitId=xxx&action=PAYMENT_COLLECTED&from=2026-01-01T00:00:00Z
     */
    @GetMapping("/logs")
    public ResponseEntity<ApiResponse<Page<AuditLogResponse>>> search(
            @RequestParam(required = false) String entityType,
            @RequestParam(required = false) String entityId,
            @RequestParam(required = false) String chitId,
            @RequestParam(required = false) String actorId,
            @RequestParam(required = false) String action,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant to,
            @PageableDefault(size = 50, sort = "createdAt") Pageable pageable) {

        return ResponseEntity.ok(ApiResponse.success(
                auditService.search(entityType, entityId, chitId, actorId, action, from, to, pageable)));
    }

    /**
     * Full chronological history of a specific entity.
     * Example: GET /audit/logs/PAYMENT/batch-uuid-here
     * → "Who collected this batch? When was it remitted? What changed?"
     */
    @GetMapping("/logs/{entityType}/{entityId}")
    public ResponseEntity<ApiResponse<Page<AuditLogResponse>>> getEntityHistory(
            @PathVariable String entityType,
            @PathVariable String entityId,
            @PageableDefault(size = 50) Pageable pageable) {

        return ResponseEntity.ok(ApiResponse.success(
                auditService.getEntityHistory(entityType, entityId, pageable)));
    }

    /**
     * Everything that happened to a chit across all entity types.
     * Example: GET /audit/logs/chit/chit-uuid → payments, winner selections, payout, member joins
     */
    @GetMapping("/logs/chit/{chitId}")
    public ResponseEntity<ApiResponse<Page<AuditLogResponse>>> getChitHistory(
            @PathVariable String chitId,
            @PageableDefault(size = 50) Pageable pageable) {

        return ResponseEntity.ok(ApiResponse.success(
                auditService.getChitHistory(chitId, pageable)));
    }

    /**
     * What did this admin/worker do? Useful for investigating suspicious activity.
     * Example: GET /audit/logs/actor/user-uuid
     */
    @GetMapping("/logs/actor/{actorId}")
    public ResponseEntity<ApiResponse<Page<AuditLogResponse>>> getActorHistory(
            @PathVariable String actorId,
            @PageableDefault(size = 50) Pageable pageable) {

        return ResponseEntity.ok(ApiResponse.success(
                auditService.getActorHistory(actorId, pageable)));
    }
}
