package com.chitfund.chitservice.security;

import io.jsonwebtoken.*;
import io.jsonwebtoken.security.Keys;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;

/**
 * Downstream service JWT validator — validates and reads tokens, never generates them.
 *
 * WHY only validate here, not generate?
 * Token generation is user-service's responsibility. Chit-service only receives
 * tokens from clients and needs to verify: "Is this token legitimate and not expired?"
 *
 * WHY share the same JWT secret across services?
 * All services validate with the same HS256 secret. In production, fetch the
 * secret from AWS Secrets Manager / HashiCorp Vault at startup — never hardcode.
 * For RS256 (asymmetric), services would only need the PUBLIC key — more secure
 * because the private key never leaves user-service.
 */
@Component
@Slf4j
public class JwtTokenProvider {

    @Value("${jwt.secret}")
    private String jwtSecret;

    public Claims extractClaims(String token) {
        return Jwts.parser()
                .verifyWith(getSigningKey())
                .build()
                .parseSignedClaims(token)
                .getPayload();
    }

    public boolean validateToken(String token) {
        try {
            extractClaims(token);
            return true;
        } catch (ExpiredJwtException e) {
            log.debug("JWT expired");
        } catch (JwtException | IllegalArgumentException e) {
            log.debug("Invalid JWT: {}", e.getMessage());
        }
        return false;
    }

    private SecretKey getSigningKey() {
        return Keys.hmacShaKeyFor(jwtSecret.getBytes(StandardCharsets.UTF_8));
    }
}
