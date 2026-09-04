package com.chitfund.supportservice.security;

import com.chitfund.supportservice.domain.entity.Employee;
import io.jsonwebtoken.*;
import io.jsonwebtoken.security.Keys;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.Date;

@Component
@Slf4j
public class HubJwtTokenProvider {

    @Value("${hub.jwt.secret}")
    private String hubJwtSecret;

    @Value("${hub.jwt.access-token-expiry-ms}")
    private long expiryMs;

    public String generateToken(Employee employee) {
        return Jwts.builder()
                .subject(employee.getId())
                .claim("email", employee.getEmail())
                .claim("fullName", employee.getFullName())
                .claim("role", employee.getRole())
                .claim("type", "HUB")
                .issuedAt(new Date())
                .expiration(new Date(System.currentTimeMillis() + expiryMs))
                .signWith(signingKey())
                .compact();
    }

    public Claims extractClaims(String token) {
        return Jwts.parser()
                .verifyWith(signingKey())
                .build()
                .parseSignedClaims(token)
                .getPayload();
    }

    public boolean validateToken(String token) {
        try {
            Claims claims = extractClaims(token);
            return "HUB".equals(claims.get("type", String.class));
        } catch (ExpiredJwtException e) {
            log.debug("Hub JWT expired");
        } catch (JwtException | IllegalArgumentException e) {
            log.debug("Invalid hub JWT: {}", e.getMessage());
        }
        return false;
    }

    public String extractEmployeeId(String token) {
        return extractClaims(token).getSubject();
    }

    public String extractRole(String token) {
        return extractClaims(token).get("role", String.class);
    }

    private SecretKey signingKey() {
        return Keys.hmacShaKeyFor(hubJwtSecret.getBytes(StandardCharsets.UTF_8));
    }
}
