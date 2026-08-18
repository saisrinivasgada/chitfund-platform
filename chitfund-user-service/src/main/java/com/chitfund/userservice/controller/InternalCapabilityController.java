package com.chitfund.userservice.controller;

import com.chitfund.userservice.domain.entity.PlanLimits;
import com.chitfund.userservice.domain.entity.Tenant;
import com.chitfund.userservice.repository.PlanLimitsRepository;
import com.chitfund.userservice.repository.TenantRepository;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

/**
 * Internal-only endpoint consumed by sibling services (reporting, payment, etc.)
 * to check what capabilities a tenant's plan grants.
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
    private final ObjectMapper objectMapper;

    @Value("${app.internal-key:chitfund-internal-service-key}")
    private String internalKey;

    /**
     * Returns the list of capability keys enabled for the tenant's current plan.
     * Example: ["full_analytics", "digital_payments"]
     */
    @GetMapping("/tenants/{tenantId}")
    public ResponseEntity<List<String>> getTenantCapabilities(
            @PathVariable String tenantId,
            @RequestHeader(value = "X-Internal-Key", required = false) String key) {

        if (!internalKey.equals(key)) {
            log.warn("Internal capability check rejected — bad key from caller for tenant {}", tenantId);
            return ResponseEntity.status(403).build();
        }

        try {
            Tenant tenant = tenantRepository.findById(UUID.fromString(tenantId)).orElse(null);
            if (tenant == null) return ResponseEntity.ok(List.of());

            PlanLimits plan = planRepo.findById(tenant.getPlan().toUpperCase()).orElse(null);
            if (plan == null) return ResponseEntity.ok(List.of());

            return ResponseEntity.ok(parseCapabilities(plan.getCapabilities()));
        } catch (Exception e) {
            log.error("Error fetching capabilities for tenant {}: {}", tenantId, e.getMessage());
            return ResponseEntity.ok(List.of());
        }
    }

    private List<String> parseCapabilities(String json) {
        if (json == null || json.isBlank()) return List.of();
        try {
            return objectMapper.readValue(json, new TypeReference<List<String>>() {});
        } catch (Exception e) {
            return List.of();
        }
    }
}
