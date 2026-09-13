package com.chitfund.supportservice.controller.hub;

import com.chitfund.supportservice.dto.request.InviteEmployeeRequest;
import com.chitfund.supportservice.dto.request.ResetEmployeePasswordRequest;
import com.chitfund.supportservice.dto.request.UpdateEmployeeRoleRequest;
import com.chitfund.supportservice.dto.response.EmployeeResponse;
import com.chitfund.supportservice.service.EmployeeService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/hub/employees")
@RequiredArgsConstructor
public class HubEmployeeController {

    private final EmployeeService employeeService;

    @GetMapping("/directory")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<?> directory(Authentication auth) {
        String callerId = (String) auth.getPrincipal();
        List<Map<String, Object>> employees = employeeService.listAll().stream()
                .filter(EmployeeResponse::isActive)
                .filter(employee -> !employee.getId().equals(callerId))
                .map(employee -> {
                    Map<String, Object> item = new java.util.LinkedHashMap<>();
                    item.put("id", employee.getId());
                    item.put("employeeId", employee.getEmployeeId());
                    item.put("fullName", employee.getFullName());
                    item.put("role", employee.getRole());
                    return item;
                }).toList();
        return ResponseEntity.ok(Map.of("success", true, "data", employees));
    }

    @GetMapping
    @PreAuthorize("hasAuthority('SUPER_ADMIN')")
    public ResponseEntity<?> listAll() {
        List<EmployeeResponse> employees = employeeService.listAll();
        return ResponseEntity.ok(Map.of("success", true, "data", employees));
    }

    @PostMapping("/invite")
    @PreAuthorize("hasAuthority('SUPER_ADMIN')")
    public ResponseEntity<?> invite(@Valid @RequestBody InviteEmployeeRequest body) {
        EmployeeResponse employee = employeeService.invite(body);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(Map.of("success", true, "data", employee));
    }

    @PatchMapping("/{id}/role")
    @PreAuthorize("hasAuthority('SUPER_ADMIN')")
    public ResponseEntity<?> updateRole(@PathVariable String id,
                                         Authentication auth,
                                         @Valid @RequestBody UpdateEmployeeRoleRequest body) {
        EmployeeResponse employee = employeeService.updateRole(id, (String) auth.getPrincipal(), body);
        return ResponseEntity.ok(Map.of("success", true, "data", employee));
    }

    @PatchMapping("/{id}/deactivate")
    @PreAuthorize("hasAuthority('SUPER_ADMIN')")
    public ResponseEntity<?> deactivate(@PathVariable String id, Authentication auth) {
        EmployeeResponse employee = employeeService.setActive(id, (String) auth.getPrincipal(), false);
        return ResponseEntity.ok(Map.of("success", true, "data", employee));
    }

    @PostMapping("/{id}/resend-invite")
    @PreAuthorize("hasAuthority('SUPER_ADMIN')")
    public ResponseEntity<?> resendInvite(@PathVariable String id) {
        EmployeeResponse employee = employeeService.resendInvite(id);
        return ResponseEntity.ok(Map.of("success", true, "data", employee));
    }

    @PostMapping("/{id}/reset-password")
    @PreAuthorize("hasAuthority('SUPER_ADMIN')")
    public ResponseEntity<?> resetPassword(@PathVariable String id,
                                           Authentication auth,
                                           @Valid @RequestBody ResetEmployeePasswordRequest body) {
        EmployeeResponse employee = employeeService.resetPassword(id, (String) auth.getPrincipal(), body);
        return ResponseEntity.ok(Map.of("success", true, "data", employee));
    }

    @PatchMapping("/{id}/reactivate")
    @PreAuthorize("hasAuthority('SUPER_ADMIN')")
    public ResponseEntity<?> reactivate(@PathVariable String id, Authentication auth) {
        EmployeeResponse employee = employeeService.setActive(id, (String) auth.getPrincipal(), true);
        return ResponseEntity.ok(Map.of("success", true, "data", employee));
    }
}
