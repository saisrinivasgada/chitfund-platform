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

import java.util.List;
import java.util.Optional;
import java.util.UUID;

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

            String planCode = tenant.getPlan() != null ? tenant.getPlan().toUpperCase() : "BASIC";

            // CUSTOM plan: capabilities are individually configured per-tenant in tenant_custom_limits.
            // All other plans: capabilities come directly from plan_limits so that editing a plan
            // immediately applies to every tenant on it — no per-tenant sync needed.
            if ("CUSTOM".equals(planCode)) {
                Optional<TenantCustomLimits> custom = customLimitsRepository.findById(tenantId);
                return ResponseEntity.ok(
                        custom.map(this::resolveCustomCapabilities).orElse(List.of()));
            }

            PlanLimits plan = planRepo.findById(planCode).orElse(null);
            if (plan == null) return ResponseEntity.ok(List.of());
            return ResponseEntity.ok(parse(plan.getCapabilities()));

        } catch (Exception e) {
            log.error("Error fetching capabilities for tenant {}: {}", tenantId, e.getMessage());
            return ResponseEntity.ok(List.of());
        }
    }

    private List<String> resolveCustomCapabilities(TenantCustomLimits c) {
        return parse(c.getCapabilities());
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
