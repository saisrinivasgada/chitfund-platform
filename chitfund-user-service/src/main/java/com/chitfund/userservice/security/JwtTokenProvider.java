package com.chitfund.userservice.security;

import com.chitfund.userservice.domain.entity.User;
import com.chitfund.userservice.dto.response.TenantInfo;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.jsonwebtoken.*;
import io.jsonwebtoken.security.Keys;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.Date;
import java.util.List;
import java.util.UUID;

@Component
@Slf4j
@RequiredArgsConstructor
public class JwtTokenProvider {

    private final ObjectMapper objectMapper;

    @Value("${jwt.secret}")
    private String jwtSecret;

    @Value("${jwt.access-token-expiry-ms}")
    private long accessTokenExpiryMs;

    // ── Scoped token (normal login after tenant selection) ───────────────────
    public String generateAccessToken(User user) {
        return Jwts.builder()
                .subject(user.getId().toString())
                .claim("username", user.getUsername())
                .claim("role", user.getRole().name())
                .issuedAt(new Date())
                .expiration(new Date(System.currentTimeMillis() + accessTokenExpiryMs))
                .signWith(getSigningKey())
                .compact();
    }

    // Super-admin token: no tenantId (they manage all tenants globally)
    public String generateSuperAdminToken(User user) {
        return Jwts.builder()
                .subject(user.getId().toString())
                .claim("username", user.getUsername())
                .claim("role", user.getRole().name())
                .claim("scope", "SUPER_ADMIN")
                .issuedAt(new Date())
                .expiration(new Date(System.currentTimeMillis() + accessTokenExpiryMs))
                .signWith(getSigningKey())
                .compact();
    }

    // Scoped token — includes tenantId, tenantSlug, tenantPlan, tenantStatus, memberId for downstream isolation
    public String generateScopedToken(User user, String tenantId, String tenantSlug, String tenantPlan, String tenantStatus, String tenantRole, String memberId) {
        var builder = Jwts.builder()
                .subject(user.getId().toString())
                .claim("username", user.getUsername())
                .claim("role", tenantRole)
                .claim("tenantId", tenantId)
                .claim("tenantSlug", tenantSlug)
                .claim("tenantPlan", tenantPlan != null ? tenantPlan.toUpperCase() : "BASIC")
                .claim("tenantStatus", tenantStatus != null ? tenantStatus.toUpperCase() : "ACTIVE")
                .issuedAt(new Date())
                .expiration(new Date(System.currentTimeMillis() + accessTokenExpiryMs));
        if (memberId != null) {
            builder.claim("memberId", memberId);
        }
        return builder.signWith(getSigningKey()).compact();
    }

    // Pre-scope token — 5 min, carries tenant list, used only at /auth/select-tenant
    public String generatePreScopeToken(User user, List<TenantInfo> tenants) {
        try {
            String tenantsJson = objectMapper.writeValueAsString(tenants);
            return Jwts.builder()
                    .subject(user.getId().toString())
                    .claim("username", user.getUsername())
                    .claim("role", user.getRole().name())
                    .claim("scope", "TENANT_SELECT")
                    .claim("tenants", tenantsJson)
                    .issuedAt(new Date())
                    .expiration(new Date(System.currentTimeMillis() + 5 * 60 * 1000L)) // 5 min
                    .signWith(getSigningKey())
                    .compact();
        } catch (Exception e) {
            throw new RuntimeException("Failed to generate pre-scope token", e);
        }
    }

    // Transfer token for cross-subdomain switching: 30 seconds, opaque UUID stored in Redis/DB
    public String generateRefreshTokenValue() {
        return UUID.randomUUID().toString();
    }

    public Claims extractClaims(String token) {
        return Jwts.parser()
                .verifyWith(getSigningKey())
                .build()
                .parseSignedClaims(token)
                .getPayload();
    }

    public String extractUserId(String token) {
        return extractClaims(token).getSubject();
    }

    public String extractTenantId(String token) {
        return extractClaims(token).get("tenantId", String.class);
    }

    public String extractScope(String token) {
        return extractClaims(token).get("scope", String.class);
    }

    public List<TenantInfo> extractTenants(String token) {
        try {
            String tenantsJson = extractClaims(token).get("tenants", String.class);
            if (tenantsJson == null) return List.of();
            return objectMapper.readValue(tenantsJson, new TypeReference<>() {});
        } catch (Exception e) {
            return List.of();
        }
    }

    public boolean validateToken(String token) {
        try {
            extractClaims(token);
            return true;
        } catch (ExpiredJwtException e) {
            log.debug("JWT token expired");
        } catch (JwtException | IllegalArgumentException e) {
            log.debug("Invalid JWT token: {}", e.getMessage());
        }
        return false;
    }

    private SecretKey getSigningKey() {
        byte[] keyBytes = jwtSecret.getBytes(StandardCharsets.UTF_8);
        return Keys.hmacShaKeyFor(keyBytes);
    }
}
