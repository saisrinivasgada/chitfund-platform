package com.chitfund.auditservice.controller;

import com.chitfund.auditservice.dto.AuditLogResponse;
import com.chitfund.auditservice.service.AuditService;
import com.chitfund.common.context.TenantContext;
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
 * Admin-only read side. Tenant isolation is enforced by reading tenantId from TenantContext
 * (set by JwtAuthenticationFilter from the JWT claim). Every query is scoped to the caller's org.
 */
@RestController
@RequestMapping("/audit")
@RequiredArgsConstructor
@PreAuthorize("hasAnyRole('ROLE_ADMIN', 'ROLE_MANAGER')")
public class AuditQueryController {

    private final AuditService auditService;

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

        String tenantId = TenantContext.get();
        return ResponseEntity.ok(ApiResponse.success(
                auditService.search(tenantId, entityType, entityId, chitId, actorId, action, from, to, pageable)));
    }

    @GetMapping("/logs/{entityType}/{entityId}")
    public ResponseEntity<ApiResponse<Page<AuditLogResponse>>> getEntityHistory(
            @PathVariable String entityType,
            @PathVariable String entityId,
            @PageableDefault(size = 50) Pageable pageable) {

        String tenantId = TenantContext.get();
        return ResponseEntity.ok(ApiResponse.success(
                auditService.getEntityHistory(entityType, entityId, tenantId, pageable)));
    }

    @GetMapping("/logs/chit/{chitId}")
    public ResponseEntity<ApiResponse<Page<AuditLogResponse>>> getChitHistory(
            @PathVariable String chitId,
            @PageableDefault(size = 50) Pageable pageable) {

        String tenantId = TenantContext.get();
        return ResponseEntity.ok(ApiResponse.success(
                auditService.getChitHistory(chitId, tenantId, pageable)));
    }

    @GetMapping("/logs/actor/{actorId}")
    public ResponseEntity<ApiResponse<Page<AuditLogResponse>>> getActorHistory(
            @PathVariable String actorId,
            @PageableDefault(size = 50) Pageable pageable) {

        String tenantId = TenantContext.get();
        return ResponseEntity.ok(ApiResponse.success(
                auditService.getActorHistory(actorId, tenantId, pageable)));
    }
}
