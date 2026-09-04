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

    @Value("${spring.application.name:unknown-service}")
    private String serviceName;

    @Override
    protected void doFilterInternal(@NonNull HttpServletRequest request,
                                    @NonNull HttpServletResponse response,
                                    @NonNull FilterChain chain) throws ServletException, IOException {
        try {
            MDC.put("requestId", UUID.randomUUID().toString());
            MDC.put("service",   serviceName);
            MDC.put("method",    request.getMethod());
            MDC.put("path",      request.getRequestURI());
            MDC.put("ip",        resolveClientIp(request));

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
}
