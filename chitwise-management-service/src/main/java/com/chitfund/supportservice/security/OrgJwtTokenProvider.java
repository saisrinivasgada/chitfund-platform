package com.chitfund.supportservice.security;

import com.chitfund.supportservice.domain.entity.Employee;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.Date;
import java.util.UUID;

/**
 * Validates org-user JWTs (same secret as the API gateway).
 * Used on WebSocket CONNECT so org users are fully authenticated
 * rather than just trusting a spoofable X-User-Id header.
 */
@Component
@Slf4j
public class OrgJwtTokenProvider {

    @Value("${org.jwt.secret}")
    private String orgJwtSecret;

    @Value("${hub.jwt.access-token-expiry-ms}")
    private long accessTokenExpiryMs;

    /**
     * Issues the existing SaaS SUPER_ADMIN credential from the canonical Hub
     * employee identity. User-service revalidates the employee's live auth
     * version before accepting this token.
     */
    public String generateHubSuperAdminToken(Employee employee) {
        if (!"SUPER_ADMIN".equals(employee.getRole())) {
            throw new IllegalArgumentException("Only Hub super admins receive SaaS access");
        }
        String actorId = UUID.nameUUIDFromBytes(
                ("chitwise-hub:" + employee.getId()).getBytes(StandardCharsets.UTF_8)).toString();
        return Jwts.builder()
                .subject(actorId)
                .claim("username", employee.getUsername())
                .claim("fullName", employee.getFullName())
                .claim("email", employee.getEmail())
                .claim("role", "SUPER_ADMIN")
                .claim("scope", "HUB_SUPER_ADMIN")
                .claim("hubEmployeeId", employee.getId())
                .claim("authVersion", employee.getAuthVersion())
                .issuedAt(new Date())
                .expiration(new Date(System.currentTimeMillis() + accessTokenExpiryMs))
                .signWith(signingKey())
                .compact();
    }

    public Claims validateAndExtract(String token) {
        try {
            Claims claims = Jwts.parser()
                    .verifyWith(signingKey())
                    .build()
                    .parseSignedClaims(token)
                    .getPayload();

            // Reject pre-scoped / OTP-pending tokens
            String scope = claims.get("scope", String.class);
            if ("TENANT_SELECT".equals(scope) || "LOGIN_OTP_PENDING".equals(scope)) {
                return null;
            }
            return claims;
        } catch (JwtException | IllegalArgumentException e) {
            log.debug("Invalid org JWT on WebSocket CONNECT: {}", e.getMessage());
            return null;
        }
    }

    private SecretKey signingKey() {
        return Keys.hmacShaKeyFor(orgJwtSecret.getBytes(StandardCharsets.UTF_8));
    }
}
