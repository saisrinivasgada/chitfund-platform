package com.chitfund.supportservice.service;

import com.chitfund.supportservice.client.AuditClient;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.Map;

/** Persists security outcomes independently of a rejected authentication transaction. */
@Service
@RequiredArgsConstructor
@Slf4j
public class HubSecurityAuditService {

    private static final String PLATFORM_AUDIT_TENANT = "PLATFORM";
    private final AuditClient auditClient;

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void recordDeniedLogin(String attemptedUsername, String reasonCode) {
        try {
            // The digest lets security teams correlate repeated attempts without
            // storing or exposing the submitted username or email address.
            String attemptSubject = sha256(attemptedUsername == null ? "" : attemptedUsername.trim());
            auditClient.logEntity("HUB_AUTH", attemptSubject, "LOGIN_DENIED",
                    null, "ANONYMOUS", null,
                    Map.of("status", "DENIED"),
                    Map.of("reasonCode", reasonCode),
                    PLATFORM_AUDIT_TENANT, "Invalid credentials");
        } catch (RuntimeException exception) {
            // Authentication must remain denied even if its security-event sink is
            // temporarily unavailable. This ERROR is alertable and contains no PII.
            log.error("Failed to persist denied Hub login audit: {}",
                    exception.getClass().getSimpleName());
        }
    }

    private static String sha256(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 not available", exception);
        }
    }
}
