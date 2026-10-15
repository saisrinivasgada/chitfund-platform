package com.chitfund.userservice.service;

import com.chitfund.userservice.client.AuditClient;
import com.chitfund.userservice.domain.entity.User;
import com.chitfund.userservice.repository.RefreshTokenRepository;
import com.chitfund.userservice.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.Map;
import java.util.UUID;

/**
 * Persists security controls that must survive a rejected authentication request.
 * A normal AuthService transaction rolls back when it throws the 401/403 response;
 * these operations therefore require an independent transaction.
 */
@Service
@RequiredArgsConstructor
public class AuthenticationSecurityService {
    static final int MAX_FAILED_ATTEMPTS = 5;
    static final String IDENTITY_AUDIT_TENANT = "IDENTITY";

    private final UserRepository userRepository;
    private final RefreshTokenRepository refreshTokenRepository;
    private final AuditClient auditClient;

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public boolean recordFailedLoginAttempt(UUID userId) {
        User user = userRepository.findByIdForUpdate(userId).orElse(null);
        if (user == null) return false;

        int beforeAttempts = user.getFailedLoginAttempts();
        int attempts = beforeAttempts + 1;
        user.setFailedLoginAttempts(attempts);
        if (attempts >= MAX_FAILED_ATTEMPTS) user.setLocked(true);
        userRepository.save(user);

        auditClient.log("USER_ACCOUNT", user.getId().toString(), "LOGIN_FAILED",
                null, "ANONYMOUS",
                Map.of("failedAttempts", beforeAttempts, "locked", beforeAttempts >= MAX_FAILED_ATTEMPTS),
                Map.of("failedAttempts", attempts, "locked", user.isLocked()),
                auditTenant(user), "API", "DENIED", "Invalid credentials");
        return user.isLocked();
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void recordLockedLoginAttempt(UUID userId) {
        User user = userRepository.findByIdForUpdate(userId).orElse(null);
        if (user == null) return;
        auditClient.log("USER_ACCOUNT", user.getId().toString(), "LOGIN_BLOCKED",
                null, "ANONYMOUS", null,
                Map.of("failedAttempts", user.getFailedLoginAttempts(), "locked", true),
                auditTenant(user), "API", "DENIED", "Account locked");
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void recordUnknownLoginAttempt(String identifier) {
        String fingerprint = sha256(identifier == null ? "" : identifier.trim().toLowerCase());
        auditClient.log("LOGIN_IDENTIFIER", fingerprint, "LOGIN_FAILED",
                null, "ANONYMOUS", null, Map.of("accountResolved", false),
                IDENTITY_AUDIT_TENANT, "API", "DENIED", "Invalid credentials");
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void recordRefreshTokenReplay(UUID userId) {
        User user = userRepository.findByIdForUpdate(userId).orElse(null);
        if (user == null) return;
        refreshTokenRepository.revokeAllActiveByUser(user);
        auditClient.log("USER_ACCOUNT", user.getId().toString(), "REFRESH_TOKEN_REPLAYED",
                null, "ANONYMOUS", null, Map.of("allSessionsRevoked", true),
                auditTenant(user), "API", "DENIED", "Revoked refresh token was reused");
    }

    private static String auditTenant(User user) {
        return user.getTenantId() == null || user.getTenantId().isBlank()
                ? IDENTITY_AUDIT_TENANT : user.getTenantId();
    }

    private static String sha256(String value) {
        try {
            return HexFormat.of().formatHex(
                    MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception exception) {
            throw new IllegalStateException("Could not fingerprint login identifier", exception);
        }
    }
}
