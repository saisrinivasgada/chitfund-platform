package com.chitfund.userservice.security;

import com.chitfund.userservice.domain.entity.User;
import io.jsonwebtoken.*;
import io.jsonwebtoken.security.Keys;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.Date;
import java.util.UUID;

/**
 * Handles all JWT operations: generate, validate, extract claims.
 *
 * WHY JWT for access tokens?
 * - STATELESS: The resource server (chit-service, payment-service) can verify the token
 *   using only the shared secret — no DB lookup, no network call to user-service.
 *   This is critical for microservice performance.
 * - Contains user ID + role → downstream services know WHO is calling without DB hit.
 * - Trade-off: JWTs can't be revoked before expiry. Solution: short expiry (15 min)
 *   + opaque refresh tokens (revocable, stored in DB).
 *
 * WHY JJWT 0.12.x API vs 0.11.x?
 * - 0.12.x: Jwts.parser() replaces deprecated Jwts.parserBuilder()
 * - 0.12.x: .subject() replaces .setSubject() (builder uses fluent setters now)
 * - Always use the API jar at compile time, impl jar at runtime — clean separation.
 *
 * WHY HS256 (HMAC-SHA256) not RS256 (RSA)?
 * - HS256: one shared secret, fast, simple. All services must share the secret.
 * - RS256: public/private key pair. Services only need the public key to verify.
 *   Better for zero-trust architectures where you don't want all services holding the secret.
 * - For this monorepo with controlled services: HS256 is fine.
 * - INTERVIEW: "At Netflix/Google scale you'd use RS256 with a JWKS endpoint so
 *   any service can fetch the public key and verify without sharing secrets."
 */
@Component
@Slf4j
public class JwtTokenProvider {

    @Value("${jwt.secret}")
    private String jwtSecret;

    @Value("${jwt.access-token-expiry-ms}")
    private long accessTokenExpiryMs;

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

    // Refresh token is just a random UUID — opaque, stored in DB, revocable
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
