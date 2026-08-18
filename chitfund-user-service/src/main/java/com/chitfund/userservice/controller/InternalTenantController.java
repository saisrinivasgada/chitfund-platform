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

    @GetMapping("/{tenantId}/effective-limits")
    public ResponseEntity<EffectiveLimitsResponse> getEffectiveLimits(
            @PathVariable String tenantId,
            @RequestHeader(value = "X-Internal-Key", required = true) String key) {
        if (!internalKey.equals(key)) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        return ResponseEntity.ok(tenantService.getEffectiveLimits(tenantId));
    }
}
