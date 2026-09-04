package com.chitfund.supportservice.controller.hub;

import com.chitfund.supportservice.dto.request.AcceptInviteRequest;
import com.chitfund.supportservice.dto.request.InviteEmployeeRequest;
import com.chitfund.supportservice.dto.request.UpdateEmployeeRoleRequest;
import com.chitfund.supportservice.dto.response.EmployeeLoginResponse;
import com.chitfund.supportservice.dto.response.EmployeeResponse;
import com.chitfund.supportservice.service.EmployeeService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/hub/employees")
@RequiredArgsConstructor
public class HubEmployeeController {

    private final EmployeeService employeeService;

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
                                         @Valid @RequestBody UpdateEmployeeRoleRequest body) {
        EmployeeResponse employee = employeeService.updateRole(id, body);
        return ResponseEntity.ok(Map.of("success", true, "data", employee));
    }

    @PatchMapping("/{id}/deactivate")
    @PreAuthorize("hasAuthority('SUPER_ADMIN')")
    public ResponseEntity<?> deactivate(@PathVariable String id) {
        EmployeeResponse employee = employeeService.setActive(id, false);
        return ResponseEntity.ok(Map.of("success", true, "data", employee));
    }

    @PostMapping("/{id}/resend-invite")
    @PreAuthorize("hasAuthority('SUPER_ADMIN')")
    public ResponseEntity<?> resendInvite(@PathVariable String id) {
        EmployeeResponse employee = employeeService.resendInvite(id);
        return ResponseEntity.ok(Map.of("success", true, "data", employee));
    }

    @PatchMapping("/{id}/reactivate")
    @PreAuthorize("hasAuthority('SUPER_ADMIN')")
    public ResponseEntity<?> reactivate(@PathVariable String id) {
        EmployeeResponse employee = employeeService.setActive(id, true);
        return ResponseEntity.ok(Map.of("success", true, "data", employee));
    }
}
