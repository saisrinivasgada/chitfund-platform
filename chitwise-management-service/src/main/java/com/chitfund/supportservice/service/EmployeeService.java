package com.chitfund.supportservice.service;

import com.chitfund.supportservice.domain.entity.Employee;
import com.chitfund.supportservice.dto.request.AcceptInviteRequest;
import com.chitfund.supportservice.dto.request.EmployeeLoginRequest;
import com.chitfund.supportservice.dto.request.InviteEmployeeRequest;
import com.chitfund.supportservice.dto.request.UpdateEmployeeRoleRequest;
import com.chitfund.supportservice.dto.response.EmployeeLoginResponse;
import com.chitfund.supportservice.dto.response.EmployeeResponse;
import com.chitfund.supportservice.repository.EmployeeRepository;
import com.chitfund.supportservice.security.HubJwtTokenProvider;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Slf4j
public class EmployeeService {

    private final EmployeeRepository employeeRepository;
    private final HubJwtTokenProvider jwtTokenProvider;
    private final PasswordEncoder passwordEncoder;

    @Transactional
    public EmployeeLoginResponse login(EmployeeLoginRequest request) {
        Employee employee = employeeRepository.findByUsername(request.getUsername())
                .orElseThrow(() -> new IllegalArgumentException("Invalid credentials"));

        if (!employee.isActive()) {
            throw new IllegalArgumentException("Account is deactivated");
        }

        if (employee.getPasswordHash() == null) {
            throw new IllegalArgumentException("Account not activated — check your invite email");
        }

        if (!passwordEncoder.matches(request.getPassword(), employee.getPasswordHash())) {
            throw new IllegalArgumentException("Invalid credentials");
        }

        employee.setLastLoginAt(Instant.now());
        employeeRepository.save(employee);

        String token = jwtTokenProvider.generateToken(employee);

        return EmployeeLoginResponse.builder()
                .token(token)
                .employeeId(formatCardId(employee))
                .fullName(employee.getFullName())
                .email(employee.getEmail())
                .role(employee.getRole())
                .build();
    }

    public Employee getById(String id) {
        return employeeRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Employee not found"));
    }

    @Transactional(readOnly = true)
    public List<EmployeeResponse> listAll() {
        return employeeRepository.findAll().stream()
                .map(this::toResponse)
                .toList();
    }

    @Transactional
    public EmployeeResponse invite(InviteEmployeeRequest req) {
        if (employeeRepository.existsByEmail(req.getEmail())) {
            throw new IllegalStateException("Email already registered");
        }

        String token = UUID.randomUUID().toString();
        Employee employee = Employee.builder()
                .id(UUID.randomUUID().toString())
                .fullName(req.getFullName())
                .email(req.getEmail())
                .username(req.getEmail()) // temporary; set on accept-invite
                .role(req.getRole())
                .inviteToken(token)
                .inviteExpiresAt(Instant.now().plusSeconds(7 * 24 * 3600)) // 7 days
                .build();
        employee = employeeRepository.save(employee);

        log.info("Employee invite created: email={} token={}", req.getEmail(), token);
        // In prod, send invite email here via EmailService
        return toResponse(employee);
    }

    @Transactional
    public EmployeeLoginResponse acceptInvite(AcceptInviteRequest req) {
        Employee employee = employeeRepository.findByInviteToken(req.getToken())
                .orElseThrow(() -> new IllegalArgumentException("Invalid or expired invite token"));

        if (employee.getInviteExpiresAt() != null && Instant.now().isAfter(employee.getInviteExpiresAt())) {
            throw new IllegalStateException("Invite token has expired");
        }
        if (employee.getInviteAcceptedAt() != null) {
            throw new IllegalStateException("Invite already accepted");
        }
        if (employeeRepository.existsByUsername(req.getUsername())) {
            throw new IllegalStateException("Username already taken");
        }

        employee.setUsername(req.getUsername());
        employee.setPasswordHash(passwordEncoder.encode(req.getPassword()));
        employee.setInviteAcceptedAt(Instant.now());
        employee.setActive(true);
        employeeRepository.save(employee);
        // Re-fetch to get DB-generated employeeNumber
        employee = employeeRepository.findById(employee.getId()).orElse(employee);

        String token = jwtTokenProvider.generateToken(employee);
        return EmployeeLoginResponse.builder()
                .token(token)
                .employeeId(formatCardId(employee))
                .fullName(employee.getFullName())
                .email(employee.getEmail())
                .role(employee.getRole())
                .build();
    }

    @Transactional
    public EmployeeResponse updateRole(String employeeId, UpdateEmployeeRoleRequest req) {
        Employee employee = getById(employeeId);
        employee.setRole(req.getRole());
        return toResponse(employeeRepository.save(employee));
    }

    @Transactional
    public EmployeeResponse setActive(String employeeId, boolean active) {
        Employee employee = getById(employeeId);
        employee.setActive(active);
        return toResponse(employeeRepository.save(employee));
    }

    private String formatCardId(Employee e) {
        return e.getEmployeeNumber() != null
                ? String.format("CW-%04d", e.getEmployeeNumber())
                : e.getId();
    }

    private EmployeeResponse toResponse(Employee e) {
        String employeeId = formatCardId(e);
        return EmployeeResponse.builder()
                .id(e.getId())
                .employeeId(employeeId)
                .fullName(e.getFullName())
                .email(e.getEmail())
                .username(e.getUsername())
                .role(e.getRole())
                .active(e.isActive())
                .lastLoginAt(e.getLastLoginAt())
                .createdAt(e.getCreatedAt())
                .invitePending(e.getPasswordHash() == null && e.getInviteAcceptedAt() == null)
                .build();
    }
}
