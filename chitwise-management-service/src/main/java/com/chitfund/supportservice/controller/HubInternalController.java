package com.chitfund.supportservice.controller;

import com.chitfund.supportservice.domain.entity.Employee;
import com.chitfund.supportservice.service.EmployeeService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/internal/hub/employees")
@RequiredArgsConstructor
public class HubInternalController {

    private final EmployeeService employeeService;

    @GetMapping("/{id}/auth-state")
    public ResponseEntity<Map<String, Object>> authState(@PathVariable String id) {
        Employee employee = employeeService.getById(id);
        return ResponseEntity.ok(Map.of(
                "id", employee.getId(),
                "username", employee.getUsername(),
                "fullName", employee.getFullName(),
                "email", employee.getEmail(),
                "role", employee.getRole(),
                "active", employee.isActive(),
                "mustChangePassword", employee.isMustChangePassword(),
                "authVersion", employee.getAuthVersion()
        ));
    }
}
