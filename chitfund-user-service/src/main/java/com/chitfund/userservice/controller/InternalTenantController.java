package com.chitfund.userservice.controller;

import com.chitfund.userservice.dto.response.EffectiveLimitsResponse;
import com.chitfund.userservice.service.TenantService;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/internal/tenants")
@RequiredArgsConstructor
public class InternalTenantController {

    private final TenantService tenantService;

    @Value("${app.internal-key}")
    private String internalKey;

    @GetMapping
    public ResponseEntity<?> listTenants(
            @RequestHeader(value = "X-Internal-Key", required = true) String key,
            @RequestParam(required = false) String q) {
        if (!internalKey.equals(key)) return ResponseEntity.status(401).build();
        var result = tenantService.listAllTenants().stream()
                .filter(t -> q == null || q.isBlank() ||
                        t.getName().toLowerCase().contains(q.toLowerCase()) ||
                        t.getId().equals(q.trim()))
                .limit(50)
                .map(t -> java.util.Map.of("id", t.getId(), "name", t.getName(), "status", t.getStatus()))
                .toList();
        return ResponseEntity.ok(result);
    }

    @GetMapping("/{tenantId}/effective-limits")
    public ResponseEntity<EffectiveLimitsResponse> getEffectiveLimits(
            @PathVariable String tenantId,
            @RequestHeader(value = "X-Internal-Key", required = true) String key) {
        if (!internalKey.equals(key)) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        return ResponseEntity.ok(tenantService.getEffectiveLimits(tenantId));
    }

    @GetMapping("/{tenantId}/support-context")
    public ResponseEntity<java.util.Map<String, Object>> getSupportContext(
            @PathVariable String tenantId,
            @RequestHeader(value = "X-Internal-Key", required = true) String key) {
        if (!internalKey.equals(key)) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        var tenant = tenantService.getTenant(java.util.UUID.fromString(tenantId));
        var limits = tenantService.getEffectiveLimits(tenantId);
        return ResponseEntity.ok(java.util.Map.of(
                "tenantName", tenant.getName(),
                "prioritySupport", limits.isPrioritySupport()
        ));
    }
}
