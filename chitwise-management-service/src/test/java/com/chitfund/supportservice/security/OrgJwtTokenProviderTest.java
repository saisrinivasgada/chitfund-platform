package com.chitfund.supportservice.security;

import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.nio.charset.StandardCharsets;
import java.util.Date;

import static org.assertj.core.api.Assertions.assertThat;

class OrgJwtTokenProviderTest {
    private static final String SECRET = "test-org-jwt-secret-that-is-at-least-32-bytes";
    private final OrgJwtTokenProvider provider = new OrgJwtTokenProvider();

    @BeforeEach
    void configureSecret() {
        ReflectionTestUtils.setField(provider, "orgJwtSecret", SECRET);
    }

    @Test
    void rejectsSignedOrgTokenWithoutTenant() {
        String token = token(null);

        assertThat(provider.validateAndExtract(token)).isNull();
    }

    @Test
    void acceptsCompleteTenantToken() {
        String token = token("tenant-1");

        assertThat(provider.validateAndExtract(token)).isNotNull();
    }

    private String token(String tenantId) {
        var builder = Jwts.builder()
                .subject("user-1")
                .claim("role", "ADMIN")
                .issuedAt(new Date())
                .expiration(new Date(System.currentTimeMillis() + 60_000));
        if (tenantId != null) builder.claim("tenantId", tenantId);
        return builder.signWith(Keys.hmacShaKeyFor(SECRET.getBytes(StandardCharsets.UTF_8))).compact();
    }
}
