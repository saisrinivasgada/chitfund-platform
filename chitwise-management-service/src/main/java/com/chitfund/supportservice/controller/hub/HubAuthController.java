package com.chitfund.supportservice.controller.hub;

import com.chitfund.supportservice.domain.entity.Employee;
import com.chitfund.supportservice.dto.request.AcceptInviteRequest;
import com.chitfund.supportservice.dto.request.EmployeeLoginRequest;
import com.chitfund.supportservice.dto.response.EmployeeLoginResponse;
import com.chitfund.supportservice.dto.response.EmployeeMeResponse;
import com.chitfund.supportservice.service.EmployeeService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/hub/auth")
@RequiredArgsConstructor
public class HubAuthController {

    private final EmployeeService employeeService;

    @PostMapping("/login")
    public ResponseEntity<?> login(@Valid @RequestBody EmployeeLoginRequest request) {
        EmployeeLoginResponse response = employeeService.login(request);
        return ResponseEntity.ok(Map.of("success", true, "data", response));
    }

    @PostMapping("/accept-invite")
    public ResponseEntity<?> acceptInvite(@Valid @RequestBody AcceptInviteRequest request) {
        EmployeeLoginResponse response = employeeService.acceptInvite(request);
        return ResponseEntity.ok(Map.of("success", true, "data", response));
    }

    @GetMapping("/me")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<?> me(Authentication auth) {
        Employee employee = employeeService.getById((String) auth.getPrincipal());
        EmployeeMeResponse meResponse = EmployeeMeResponse.builder()
                .id(employee.getId())
                .email(employee.getEmail())
                .fullName(employee.getFullName())
                .username(employee.getUsername())
                .role(employee.getRole())
                .active(employee.isActive())
                .lastLoginAt(employee.getLastLoginAt())
                .build();
        return ResponseEntity.ok(Map.of("success", true, "data", meResponse));
    }
}
