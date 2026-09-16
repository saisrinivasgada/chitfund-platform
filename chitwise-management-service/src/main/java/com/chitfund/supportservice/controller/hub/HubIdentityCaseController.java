package com.chitfund.supportservice.controller.hub;

import com.chitfund.supportservice.domain.enums.IdentityCaseStatus;
import com.chitfund.supportservice.dto.request.IdentityCaseDecisionRequest;
import com.chitfund.supportservice.dto.request.PrepareIdentityCaseRequest;
import com.chitfund.supportservice.service.IdentityCaseService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/hub/identity-cases")
@RequiredArgsConstructor
public class HubIdentityCaseController {
    private final IdentityCaseService service;

    @GetMapping
    @PreAuthorize("hasAuthority('IDENTITY_CASE_READ')")
    public ResponseEntity<?> list(Authentication auth, @RequestParam(required = false) IdentityCaseStatus status,
                                  @RequestParam(defaultValue = "0") int page,
                                  @RequestParam(defaultValue = "20") int size) {
        return ResponseEntity.ok(Map.of("success", true, "data", service.list((String) auth.getPrincipal(), status, page, size)));
    }

    @GetMapping("/ticket/{ticketId}")
    @PreAuthorize("hasAuthority('IDENTITY_CASE_READ')")
    public ResponseEntity<?> byTicket(Authentication auth, @PathVariable String ticketId) {
        Object result = service.getByTicket((String) auth.getPrincipal(), ticketId);
        Map<String, Object> response = new java.util.LinkedHashMap<>();
        response.put("success", true);
        response.put("data", result);
        return ResponseEntity.ok(response);
    }

    @PutMapping("/{caseId}/prepare")
    @PreAuthorize("hasAuthority('IDENTITY_CASE_PREPARE')")
    public ResponseEntity<?> prepare(Authentication auth, @PathVariable String caseId,
                                     @Valid @RequestBody PrepareIdentityCaseRequest request) {
        return ResponseEntity.ok(Map.of("success", true, "data", service.prepare((String) auth.getPrincipal(), caseId, request)));
    }

    @PutMapping("/{caseId}/approve")
    @PreAuthorize("hasAuthority('IDENTITY_CASE_APPROVE')")
    public ResponseEntity<?> approve(Authentication auth, @PathVariable String caseId,
                                     @Valid @RequestBody IdentityCaseDecisionRequest request) {
        return ResponseEntity.ok(Map.of("success", true, "data", service.approve((String) auth.getPrincipal(), caseId, request)));
    }

    @PutMapping("/{caseId}/reject")
    @PreAuthorize("hasAuthority('IDENTITY_CASE_APPROVE')")
    public ResponseEntity<?> reject(Authentication auth, @PathVariable String caseId,
                                    @Valid @RequestBody IdentityCaseDecisionRequest request) {
        return ResponseEntity.ok(Map.of("success", true, "data", service.reject((String) auth.getPrincipal(), caseId, request)));
    }

    @PostMapping("/{caseId}/execute")
    @PreAuthorize("hasAuthority('IDENTITY_CASE_APPROVE')")
    public ResponseEntity<?> execute(Authentication auth, @PathVariable String caseId) {
        return ResponseEntity.ok(Map.of("success", true,
                "data", service.execute((String) auth.getPrincipal(), caseId)));
    }
}
