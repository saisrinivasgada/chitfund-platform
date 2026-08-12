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
 * Super-admin cross-tenant audit view. Passes null as tenantId to bypass the
 * per-org filter, allowing queries across all orgs. Restricted to SUPER_ADMIN only.
 */
@RestController
@RequestMapping("/audit/super-admin")
@RequiredArgsConstructor
@PreAuthorize("hasRole('ROLE_SUPER_ADMIN')")
public class SuperAdminAuditController {

    private final AuditService auditService;

    /**
     * Cross-tenant search. Optionally filter by orgId (which maps to tenantId in the DB).
     * Primary use: billing event timeline — filter by entityType=TENANT to see activations,
     * plan changes, renewals, credit additions across all orgs.
     */
    @GetMapping("/logs")
    public ResponseEntity<ApiResponse<Page<AuditLogResponse>>> search(
            @RequestParam(required = false) String orgId,
            @RequestParam(required = false) String entityType,
            @RequestParam(required = false) String entityId,
            @RequestParam(required = false) String action,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant to,
            @PageableDefault(size = 50, sort = "createdAt") Pageable pageable) {

        return ResponseEntity.ok(ApiResponse.success(
                auditService.search(orgId, entityType, entityId, null, null, action, from, to, pageable)));
    }
}
