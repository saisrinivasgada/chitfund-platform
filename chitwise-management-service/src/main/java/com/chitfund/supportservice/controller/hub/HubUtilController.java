package com.chitfund.supportservice.controller.hub;

import com.chitfund.supportservice.client.TenantSupportClient;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/hub")
@RequiredArgsConstructor
public class HubUtilController {

    private final TenantSupportClient tenantSupportClient;

    @GetMapping("/tenants")
    @PreAuthorize("hasAnyAuthority('SUPER_ADMIN', 'SUPPORT_AGENT')")
    public ResponseEntity<?> listTenants(@RequestParam(required = false) String q) {
        var tenants = tenantSupportClient.listActiveTenants(q);
        return ResponseEntity.ok(Map.of("success", true, "data", tenants));
    }
}
