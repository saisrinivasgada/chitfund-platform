package com.chitfund.userservice.controller;

import com.chitfund.userservice.service.TenantService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * Internal-only endpoint consumed by sibling services to check what capabilities
 * a tenant's plan grants.  Not routed through the API gateway; X-Internal-Key is
 * a defence-in-depth guard.
 */
@RestController
@RequestMapping("/internal/capabilities")
@RequiredArgsConstructor
@Slf4j
public class InternalCapabilityController {

    private final TenantService tenantService;

    @Value("${app.internal-key:chitfund-internal-service-key}")
    private String internalKey;

    /**
     * Returns the list of capability keys enabled for this tenant.
     * Custom-plan tenants get their capabilities from tenant_custom_limits;
     * all others get them from plan_limits.
     *
     * Example response: ["full_analytics", "digital_payments"]
     */
    @GetMapping("/tenants/{tenantId}")
    public ResponseEntity<List<String>> getTenantCapabilities(
            @PathVariable String tenantId,
            @RequestHeader(value = "X-Internal-Key", required = false) String key) {

        if (!internalKey.equals(key)) {
            log.warn("Internal capability check rejected — bad key for tenant {}", tenantId);
            return ResponseEntity.status(403).build();
        }

        try {
            return ResponseEntity.ok(tenantService.resolveCapabilitiesForTenant(tenantId));
        } catch (Exception e) {
            log.error("Error fetching capabilities for tenant {}: {}", tenantId, e.getMessage());
            return ResponseEntity.ok(List.of());
        }
    }
}
