package com.chitfund.supportservice.controller.hub;

import com.chitfund.supportservice.client.TenantSupportClient;
import com.chitfund.supportservice.service.HubPermissionService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/hub")
@RequiredArgsConstructor
public class HubUtilController {

    private final TenantSupportClient tenantSupportClient;
    private final HubPermissionService permissionService;

    @GetMapping("/tenants")
    @PreAuthorize("hasAnyAuthority('SUPER_ADMIN', 'SUPPORT_AGENT')")
    public ResponseEntity<?> listTenants(@RequestParam(required = false) String q,
                                         Authentication auth) {
        permissionService.requireAnyTicketAccess((String) auth.getPrincipal());
        var tenants = tenantSupportClient.listActiveTenants(q);
        return ResponseEntity.ok(Map.of("success", true, "data", tenants));
    }
}
