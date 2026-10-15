package com.chitfund.common.logging;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.MDC;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.lang.NonNull;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.Set;
import java.util.UUID;

/**
 * Populates MDC (Mapped Diagnostic Context) for every inbound HTTP request.
 *
 * Every log line in every service automatically gets:
 *   requestId  — unique UUID per request (for tracing across log lines)
 *   tenantId   — from X-Tenant-ID header
 *   userId     — from X-User-ID header (set by JWT filter upstream)
 *   service    — spring.application.name
 *   method     — HTTP verb
 *   path       — request URI
 *   ip         — real client IP (respects X-Forwarded-For)
 *
 * These fields appear in every JSON log line, making it trivial to:
 *   - grep all logs for a single request:  requestId=abc-123
 *   - grep all logs for a tenant:          tenantId=tenant-xyz
 *   - grep all errors for a user:          userId=user-abc
 */
public class MdcLoggingFilter extends OncePerRequestFilter {

    public static final String REQUEST_ID_HEADER = "X-Request-ID";
    public static final String CLIENT_SOURCE_HEADER = "X-Client-Source";
    public static final String IDEMPOTENCY_KEY_HEADER = "Idempotency-Key";
    public static final String DEVICE_TOKEN_HEADER = "X-Device-Token";

    private static final int MAX_CONTEXT_LENGTH = 255;
    private static final Set<String> VALID_SOURCES = Set.of(
            "WEB", "MOBILE", "HUB", "OFFLINE_SYNC", "INTERNAL_API", "WORKER", "SYSTEM");

    @Value("${spring.application.name:unknown-service}")
    private String serviceName;

    @Override
    protected void doFilterInternal(@NonNull HttpServletRequest request,
                                    @NonNull HttpServletResponse response,
                                    @NonNull FilterChain chain) throws ServletException, IOException {
        try {
            String requestId = validContextValue(request.getHeader(REQUEST_ID_HEADER));
            if (requestId == null) requestId = UUID.randomUUID().toString();
            MDC.put("requestId", requestId);
            MDC.put("service",   serviceName);
            MDC.put("method",    request.getMethod());
            MDC.put("path",      request.getRequestURI());
            MDC.put("ip",        resolveClientIp(request));
            response.setHeader(REQUEST_ID_HEADER, requestId);

            String source = normalizeSource(request.getHeader(CLIENT_SOURCE_HEADER));
            MDC.put("source", source);

            String idempotencyKey = validContextValue(request.getHeader(IDEMPOTENCY_KEY_HEADER));
            if (idempotencyKey != null) MDC.put("idempotencyKey", idempotencyKey);

            String deviceToken = validContextValue(request.getHeader(DEVICE_TOKEN_HEADER));
            if (deviceToken != null) MDC.put("deviceSessionHash", sha256(deviceToken));

            String tenantId = request.getHeader("X-Tenant-ID");
            if (tenantId != null) MDC.put("tenantId", tenantId);

            String userId = request.getHeader("X-User-ID");
            if (userId != null) MDC.put("userId", userId);

            chain.doFilter(request, response);
        } finally {
            MDC.clear();
        }
    }

    private String resolveClientIp(HttpServletRequest request) {
        String forwarded = request.getHeader("X-Forwarded-For");
        if (forwarded != null && !forwarded.isBlank()) {
            return forwarded.split(",")[0].trim();
        }
        return request.getRemoteAddr();
    }

    private static String normalizeSource(String source) {
        String normalized = source == null ? null : source.trim().toUpperCase();
        return normalized != null && VALID_SOURCES.contains(normalized) ? normalized : "UNKNOWN";
    }

    private static String validContextValue(String value) {
        if (value == null) return null;
        String normalized = value.trim();
        if (normalized.isEmpty() || normalized.length() > MAX_CONTEXT_LENGTH
                || normalized.chars().anyMatch(ch -> Character.isISOControl(ch))) {
            return null;
        }
        return normalized;
    }

    private static String sha256(String value) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is unavailable", exception);
        }
    }
}
