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
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.HexFormat;
import java.util.List;
import java.util.Base64;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Slf4j
public class EmployeeService {

    private final EmployeeRepository employeeRepository;
    private final HubJwtTokenProvider jwtTokenProvider;
    private final PasswordEncoder passwordEncoder;
    private final EmployeeInvitationMailer invitationMailer;

    private static final SecureRandom SECURE_RANDOM = new SecureRandom();

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
                .id(employee.getId())
                .employeeId(formatCardId(employee))
                .username(employee.getUsername())
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

        // Generate a cryptographically secure one-time token.
        // Store only the SHA-256 hash; the raw token is returned once to the caller
        // who must deliver it via email and MUST NOT log it.
        String rawToken = newInvitationToken();
        String tokenHash = sha256Hex(rawToken);

        Employee employee = Employee.builder()
                .id(UUID.randomUUID().toString())
                .fullName(req.getFullName())
                .email(req.getEmail())
                .username(req.getEmail()) // temporary; set on accept-invite
                .role(req.getRole())
                .inviteToken(tokenHash) // store hash, never the raw token
                .inviteExpiresAt(Instant.now().plusSeconds(7 * 24 * 3600)) // 7 days
                .build();
        employee = employeeRepository.save(employee);

        log.info("Employee invite created for email=[{}]", req.getEmail());
        sendInvitationAfterCommit(employee, rawToken);
        return toResponse(employee);
    }

    @Transactional
    public EmployeeResponse resendInvite(String employeeId) {
        Employee employee = getById(employeeId);
        if (employee.getInviteAcceptedAt() != null || employee.getPasswordHash() != null) {
            throw new IllegalStateException("Employee has already accepted the invitation");
        }

        String rawToken = newInvitationToken();
        employee.setInviteToken(sha256Hex(rawToken));
        employee.setInviteExpiresAt(Instant.now().plusSeconds(7 * 24 * 3600));
        employeeRepository.save(employee);
        sendInvitationAfterCommit(employee, rawToken);
        return toResponse(employee);
    }

    @Transactional
    public EmployeeLoginResponse acceptInvite(AcceptInviteRequest req) {
        // Hash the provided token and look up by hash, so the DB never stores raw tokens.
        String providedHash = sha256Hex(req.getToken());
        Employee employee = employeeRepository.findByInviteTokenForUpdate(providedHash)
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
        // Clear the token hash so the invite link cannot be replayed after acceptance.
        employee.setInviteToken(null);
        employee.setActive(true);
        employeeRepository.save(employee);
        // Re-fetch to get DB-generated employeeNumber
        employee = employeeRepository.findById(employee.getId()).orElse(employee);

        String token = jwtTokenProvider.generateToken(employee);
        return EmployeeLoginResponse.builder()
                .token(token)
                .id(employee.getId())
                .employeeId(formatCardId(employee))
                .username(employee.getUsername())
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

    /** Returns the lowercase hex-encoded SHA-256 digest of the input. */
    private static String sha256Hex(String input) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(input.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hash);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 not available", e);
        }
    }

    private static String newInvitationToken() {
        byte[] bytes = new byte[32];
        SECURE_RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private void sendInvitationAfterCommit(Employee employee, String rawToken) {
        Runnable send = () -> {
            try {
                invitationMailer.sendInvitation(employee.getEmail(), employee.getFullName(), rawToken);
            } catch (RuntimeException ex) {
                log.error("Employee invitation email failed for email=[{}]", employee.getEmail());
            }
        };

        if (TransactionSynchronizationManager.isActualTransactionActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    send.run();
                }
            });
        } else {
            send.run();
        }
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
