package com.chitfund.userservice.controller;

import com.chitfund.userservice.domain.entity.PlanLimits;
import com.chitfund.userservice.domain.entity.Tenant;
import com.chitfund.userservice.domain.entity.TenantCustomLimits;
import com.chitfund.userservice.repository.PlanLimitsRepository;
import com.chitfund.userservice.repository.TenantCustomLimitsRepository;
import com.chitfund.userservice.repository.TenantRepository;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Internal-only endpoint consumed by sibling services (reporting, payment, etc.)
 * to check what capabilities a tenant's plan grants.
 *
 * Resolution order:
 *   1. tenant_custom_limits row (if the tenant has custom overrides) — takes full precedence
 *   2. plan_limits for the tenant's assigned plan — used when no custom row exists
 *
 * Security: not routed through the API gateway; lives inside the Docker network.
 * X-Internal-Key is a defence-in-depth guard in case the port is ever accidentally
 * exposed — callers without the shared key are rejected.
 */
@RestController
@RequestMapping("/internal/capabilities")
@RequiredArgsConstructor
@Slf4j
public class InternalCapabilityController {

    private final TenantRepository tenantRepository;
    private final PlanLimitsRepository planRepo;
    private final TenantCustomLimitsRepository customLimitsRepository;
    private final ObjectMapper objectMapper;

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
            Tenant tenant = tenantRepository.findById(UUID.fromString(tenantId)).orElse(null);
            if (tenant == null) return ResponseEntity.ok(List.of());

            // Custom limits row takes full precedence over plan_limits
            Optional<TenantCustomLimits> custom = customLimitsRepository.findById(tenantId);
            if (custom.isPresent()) {
                return ResponseEntity.ok(resolveCustomCapabilities(custom.get()));
            }

            // Fall back to the plan's capabilities
            PlanLimits plan = planRepo.findById(tenant.getPlan().toUpperCase()).orElse(null);
            if (plan == null) return ResponseEntity.ok(List.of());
            return ResponseEntity.ok(parse(plan.getCapabilities()));

        } catch (Exception e) {
            log.error("Error fetching capabilities for tenant {}: {}", tenantId, e.getMessage());
            return ResponseEntity.ok(List.of());
        }
    }

    /**
     * Builds the capability list from a tenant_custom_limits row.
     * Uses the capabilities JSON column as the primary source; the legacy boolean
     * columns (analytics_enabled, priority_support) are kept in sync on write,
     * but we also union them here as a safety net for rows written before V135.
     */
    private List<String> resolveCustomCapabilities(TenantCustomLimits c) {
        List<String> caps = new ArrayList<>(parse(c.getCapabilities()));
        if (c.isAnalyticsEnabled()  && !caps.contains("full_analytics"))  caps.add("full_analytics");
        if (c.isPrioritySupport()   && !caps.contains("priority_support")) caps.add("priority_support");
        return caps;
    }

    private List<String> parse(String json) {
        if (json == null || json.isBlank()) return List.of();
        try {
            return objectMapper.readValue(json, new TypeReference<List<String>>() {});
        } catch (Exception e) {
            return List.of();
        }
    }
}
