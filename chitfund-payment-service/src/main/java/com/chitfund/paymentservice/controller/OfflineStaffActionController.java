package com.chitfund.paymentservice.controller;

import com.chitfund.common.dto.ApiResponse;
import com.chitfund.paymentservice.dto.request.OfflineStaffActionRequest;
import com.chitfund.paymentservice.service.OfflineStaffActionService;
import com.fasterxml.jackson.databind.JsonNode;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import java.util.UUID;

@RestController
@RequestMapping("/payments/offline/staff-actions")
@RequiredArgsConstructor
public class OfflineStaffActionController {
    private final OfflineStaffActionService service;

    @PostMapping
    @PreAuthorize("hasAuthority('ROLE_STAFF') or hasAuthority('ROLE_MANAGER')")
    public ResponseEntity<ApiResponse<JsonNode>> apply(@Valid @RequestBody OfflineStaffActionRequest command,
                                                       Authentication auth) {
        String role = auth.getAuthorities().stream().map(a -> a.getAuthority().replace("ROLE_", ""))
                .filter(value -> "STAFF".equals(value) || "MANAGER".equals(value)).findFirst().orElseThrow();
        return ResponseEntity.ok(ApiResponse.success(service.apply(command, (UUID) auth.getPrincipal(), role)));
    }
}
