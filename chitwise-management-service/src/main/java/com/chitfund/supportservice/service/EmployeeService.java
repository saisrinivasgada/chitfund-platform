package com.chitfund.supportservice.service;

import com.chitfund.supportservice.domain.entity.Employee;
import com.chitfund.supportservice.dto.request.AcceptInviteRequest;
import com.chitfund.supportservice.dto.request.ChangeEmployeePasswordRequest;
import com.chitfund.supportservice.dto.request.EmployeeLoginRequest;
import com.chitfund.supportservice.dto.request.InviteEmployeeRequest;
import com.chitfund.supportservice.dto.request.ResetEmployeePasswordRequest;
import com.chitfund.supportservice.dto.request.UpdateEmployeeRoleRequest;
import com.chitfund.supportservice.dto.request.UpdateIdentityPermissionsRequest;
import com.chitfund.supportservice.dto.request.UpdateMeRequest;
import com.chitfund.supportservice.dto.response.EmployeeLoginResponse;
import com.chitfund.supportservice.dto.response.EmployeeMeResponse;
import com.chitfund.supportservice.dto.response.EmployeeResponse;
import com.chitfund.supportservice.repository.EmployeeRepository;
import com.chitfund.supportservice.repository.HubCustomRoleRepository;
import com.chitfund.supportservice.repository.HubRefreshSessionRepository;
import com.chitfund.supportservice.domain.entity.HubRefreshSession;
import com.chitfund.supportservice.security.HubJwtTokenProvider;
import com.chitfund.supportservice.security.OrgJwtTokenProvider;
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
import java.util.Collections;
import java.util.HexFormat;
import java.util.List;
import java.util.Base64;
import java.util.Set;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Slf4j
public class EmployeeService {

    private final EmployeeRepository employeeRepository;
    private final HubCustomRoleRepository roleRepository;
    private final HubJwtTokenProvider jwtTokenProvider;
    private final OrgJwtTokenProvider orgJwtTokenProvider;
    private final PasswordEncoder passwordEncoder;
    private final EmployeeInvitationMailer invitationMailer;
    private final HubRefreshSessionRepository refreshSessionRepository;

    @org.springframework.beans.factory.annotation.Value("${hub.jwt.refresh-token-expiry-days:30}")
    private long refreshTokenExpiryDays;

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
        refreshSessionRepository.revokeAllForEmployee(employee.getId(), Instant.now());
        return toLoginResponse(employee);
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
        employee.setMustChangePassword(false);
        employee.setInviteAcceptedAt(Instant.now());
        // Clear the token hash so the invite link cannot be replayed after acceptance.
        employee.setInviteToken(null);
        employee.setActive(true);
        employeeRepository.save(employee);
        // Re-fetch to get DB-generated employeeNumber
        employee = employeeRepository.findById(employee.getId()).orElse(employee);

        return toLoginResponse(employee);
    }

    @Transactional
    public EmployeeResponse resetPassword(String employeeId, String actorId,
                                          ResetEmployeePasswordRequest req) {
        if (employeeId.equals(actorId)) {
            throw new IllegalArgumentException("Use your account password-change screen to update your own password");
        }

        Employee employee = getById(employeeId);
        if (employee.getPasswordHash() == null || employee.getInviteAcceptedAt() == null) {
            throw new IllegalStateException("This employee has not accepted their invitation yet");
        }

        validatePassword(req.getTemporaryPassword());
        employee.setPasswordHash(passwordEncoder.encode(req.getTemporaryPassword()));
        employee.setMustChangePassword(true);
        employee.setAuthVersion(employee.getAuthVersion() + 1);
        employeeRepository.save(employee);
        refreshSessionRepository.revokeAllForEmployee(employeeId, Instant.now());
        log.info("Hub employee password reset by actorId=[{}] for employeeId=[{}]", actorId, employeeId);
        return toResponse(employee);
    }

    @Transactional
    public EmployeeLoginResponse changePassword(String employeeId, ChangeEmployeePasswordRequest req) {
        Employee employee = getById(employeeId);
        if (!employee.isActive()) {
            throw new IllegalArgumentException("Account is deactivated");
        }
        if (employee.getPasswordHash() == null
                || !passwordEncoder.matches(req.getCurrentPassword(), employee.getPasswordHash())) {
            throw new IllegalArgumentException("Current password is incorrect");
        }
        validatePassword(req.getNewPassword());
        if (passwordEncoder.matches(req.getNewPassword(), employee.getPasswordHash())) {
            throw new IllegalArgumentException("New password must be different from the current password");
        }

        employee.setPasswordHash(passwordEncoder.encode(req.getNewPassword()));
        employee.setMustChangePassword(false);
        employee.setAuthVersion(employee.getAuthVersion() + 1);
        employeeRepository.save(employee);
        refreshSessionRepository.revokeAllForEmployee(employeeId, Instant.now());
        log.info("Hub employee changed password for employeeId=[{}]", employeeId);
        return toLoginResponse(employee);
    }

    @Transactional
    public EmployeeResponse updateRole(String employeeId, String actorId, UpdateEmployeeRoleRequest req) {
        if (employeeId.equals(actorId)) {
            throw new IllegalArgumentException("You cannot change your own Hub role");
        }
        Employee employee = getById(employeeId);
        if ("SUPER_ADMIN".equals(employee.getRole()) && !"SUPER_ADMIN".equals(req.getRole())
                && employeeRepository.findActiveSuperAdminsForUpdate().size() <= 1) {
            throw new IllegalStateException("At least one active Super Admin is required");
        }
        employee.setRole(req.getRole());
        employee.setAuthVersion(employee.getAuthVersion() + 1);
        return toResponse(employeeRepository.save(employee));
    }

    @Transactional
    public EmployeeResponse setActive(String employeeId, String actorId, boolean active) {
        if (!active && employeeId.equals(actorId)) {
            throw new IllegalArgumentException("You cannot deactivate your own Hub account");
        }
        Employee employee = getById(employeeId);
        if (!active && "SUPER_ADMIN".equals(employee.getRole())
                && employeeRepository.findActiveSuperAdminsForUpdate().size() <= 1) {
            throw new IllegalStateException("At least one active Super Admin is required");
        }
        employee.setActive(active);
        employee.setAuthVersion(employee.getAuthVersion() + 1);
        if (!active) {
            refreshSessionRepository.revokeAllForEmployee(employeeId, Instant.now());
        }
        return toResponse(employeeRepository.save(employee));
    }

    @Transactional
    public EmployeeResponse updateIdentityPermissions(String employeeId, String actorId,
                                                       UpdateIdentityPermissionsRequest request) {
        Employee actor = getById(actorId);
        if (!actor.isPlatformOwner()) {
            throw new IllegalStateException("Only the protected platform owner can assign identity-case access");
        }
        Employee employee = getById(employeeId);
        employee.setCanManageIdentityCases(request.isCanManageIdentityCases());
        employee.setAuthVersion(employee.getAuthVersion() + 1);
        refreshSessionRepository.revokeAllForEmployee(employeeId, Instant.now());
        return toResponse(employeeRepository.save(employee));
    }

    @Transactional
    public EmployeeLoginResponse refresh(String rawToken) {
        HubRefreshSession session = refreshSessionRepository.findByTokenHashForUpdate(sha256Hex(rawToken))
                .orElseThrow(() -> new IllegalArgumentException("Invalid refresh token"));
        if (session.getRevokedAt() != null || !session.getExpiresAt().isAfter(Instant.now())) {
            throw new IllegalArgumentException("Refresh token expired or revoked");
        }
        Employee employee = getById(session.getEmployeeId());
        if (!employee.isActive() || employee.getAuthVersion() != session.getAuthVersion()) {
            session.setRevokedAt(Instant.now());
            throw new IllegalArgumentException("Session is no longer valid");
        }
        // Rotate on every use so a stolen old refresh token cannot be replayed.
        session.setRevokedAt(Instant.now());
        return toLoginResponse(employee);
    }

    @Transactional
    public void logout(String rawToken) {
        refreshSessionRepository.findByTokenHashForUpdate(sha256Hex(rawToken))
                .ifPresent(session -> session.setRevokedAt(Instant.now()));
    }

    private String formatCardId(Employee e) {
        return e.getEmployeeNumber() != null
                ? String.format("CW-%04d", e.getEmployeeNumber())
                : e.getId();
    }

    private EmployeeLoginResponse toLoginResponse(Employee employee) {
        String refreshToken = newInvitationToken();
        refreshSessionRepository.save(HubRefreshSession.builder()
                .id(UUID.randomUUID().toString())
                .employeeId(employee.getId())
                .tokenHash(sha256Hex(refreshToken))
                .authVersion(employee.getAuthVersion())
                .expiresAt(Instant.now().plusSeconds(refreshTokenExpiryDays * 24 * 3600))
                .build());
        Set<String> customPermissions = resolveCustomPermissions(employee);
        boolean hasPlatformAccess = customPermissions.contains("PLATFORM_CONSOLE_ACCESS");
        String saasToken = null;
        if (!employee.isMustChangePassword()) {
            if ("SUPER_ADMIN".equals(employee.getRole())) {
                saasToken = orgJwtTokenProvider.generateHubSuperAdminToken(employee);
            } else if (hasPlatformAccess) {
                saasToken = orgJwtTokenProvider.generateHubPlatformAccessToken(employee);
            }
        }
        return EmployeeLoginResponse.builder()
                .token(jwtTokenProvider.generateToken(employee))
                .refreshToken(refreshToken)
                .saasToken(saasToken)
                .id(employee.getId())
                .employeeId(formatCardId(employee))
                .username(employee.getUsername())
                .fullName(employee.getFullName())
                .email(employee.getEmail())
                .role(employee.getRole())
                .mustChangePassword(employee.isMustChangePassword())
                .canManageIdentityCases(employee.isCanManageIdentityCases())
                .platformOwner(employee.isPlatformOwner())
                .customPermissions(customPermissions.isEmpty() ? null : customPermissions)
                .build();
    }

    private Set<String> resolveCustomPermissions(Employee employee) {
        if (employee.getCustomRoleId() == null) return Collections.emptySet();
        return roleRepository.findById(employee.getCustomRoleId())
                .map(r -> r.getPermissions())
                .orElse(Collections.emptySet());
    }

    private void validatePassword(String password) {
        if (password == null || password.length() < 8 || password.length() > 100
                || !password.matches(".*[A-Z].*")
                || !password.matches(".*[a-z].*")
                || !password.matches(".*[0-9].*")
                || !password.matches(".*[^A-Za-z0-9].*")) {
            throw new IllegalArgumentException(
                    "Password must contain uppercase, lowercase, number and special character");
        }
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

    public EmployeeMeResponse getMe(String employeeId) {
        Employee employee = getById(employeeId);
        Set<String> customPermissions = resolveCustomPermissions(employee);
        return EmployeeMeResponse.builder()
                .id(employee.getId())
                .email(employee.getEmail())
                .fullName(employee.getFullName())
                .username(employee.getUsername())
                .role(employee.getRole())
                .active(employee.isActive())
                .mustChangePassword(employee.isMustChangePassword())
                .canManageIdentityCases(employee.isCanManageIdentityCases())
                .platformOwner(employee.isPlatformOwner())
                .lastLoginAt(employee.getLastLoginAt())
                .customPermissions(customPermissions.isEmpty() ? null : customPermissions)
                .build();
    }

    @Transactional
    public EmployeeResponse updateMe(String employeeId, UpdateMeRequest req) {
        Employee employee = getById(employeeId);
        if (req.getFullName() != null && !req.getFullName().isBlank()) {
            employee.setFullName(req.getFullName().trim());
        }
        if (req.getEmail() != null && !req.getEmail().isBlank()) {
            if (!req.getEmail().equalsIgnoreCase(employee.getEmail())
                    && employeeRepository.existsByEmail(req.getEmail())) {
                throw new IllegalStateException("Email already in use");
            }
            employee.setEmail(req.getEmail().trim());
        }
        return toResponse(employeeRepository.save(employee));
    }

    @Transactional
    public EmployeeResponse assignCustomRole(String employeeId, String actorId, String customRoleId) {
        if (employeeId.equals(actorId)) {
            throw new IllegalArgumentException("You cannot change your own custom role");
        }
        Employee employee = getById(employeeId);
        if (customRoleId != null && !roleRepository.existsById(customRoleId)) {
            throw new IllegalArgumentException("Custom role not found");
        }
        employee.setCustomRoleId(customRoleId);
        return toResponse(employeeRepository.save(employee));
    }

    private EmployeeResponse toResponse(Employee e) {
        String employeeId = formatCardId(e);
        String customRoleName = null;
        if (e.getCustomRoleId() != null) {
            customRoleName = roleRepository.findById(e.getCustomRoleId())
                    .map(r -> r.getName())
                    .orElse(null);
        }
        return EmployeeResponse.builder()
                .id(e.getId())
                .employeeId(employeeId)
                .fullName(e.getFullName())
                .email(e.getEmail())
                .username(e.getUsername())
                .role(e.getRole())
                .customRoleId(e.getCustomRoleId())
                .customRoleName(customRoleName)
                .active(e.isActive())
                .lastLoginAt(e.getLastLoginAt())
                .createdAt(e.getCreatedAt())
                .invitePending(e.getPasswordHash() == null && e.getInviteAcceptedAt() == null)
                .mustChangePassword(e.isMustChangePassword())
                .canManageIdentityCases(e.isCanManageIdentityCases())
                .platformOwner(e.isPlatformOwner())
                .build();
    }
}
