package com.chitfund.supportservice.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;

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
