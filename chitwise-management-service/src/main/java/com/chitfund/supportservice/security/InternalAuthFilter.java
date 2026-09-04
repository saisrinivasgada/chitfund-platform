package com.chitfund.supportservice.security;

import jakarta.servlet.*;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;

import java.io.IOException;

/**
 * Defends against direct-port attacks on /api/tickets/** and /api/conversations/**
 *
 * These paths use gateway-forwarded headers (X-User-Id etc.) for identity —
 * which means anyone who can reach port 8091 directly can spoof any identity.
 * This filter verifies a shared secret the API gateway stamps on every forwarded
 * request. Without it, the request is rejected with 401 before any business logic runs.
 *
 * Gateway stamps: X-Internal-Auth: ${INTERNAL_SERVICE_KEY}
 * This service reads: ${app.internal-key} (same env var)
 *
 * Port 8091 should ALSO be firewalled to only accept traffic from the gateway's
 * security group — this filter is a defense-in-depth layer, not a substitute for
 * proper network isolation.
 */
@Component
public class InternalAuthFilter implements Filter {

    @Value("${app.internal-key}")
    private String internalKey;

    private static final String HEADER = "X-Internal-Auth";

    @Override
    public void doFilter(ServletRequest req, ServletResponse res, FilterChain chain)
            throws IOException, ServletException {

        HttpServletRequest request = (HttpServletRequest) req;
        HttpServletResponse response = (HttpServletResponse) res;

        String path = request.getRequestURI();
        boolean isInternalPath = path.startsWith("/api/tickets")
                || path.startsWith("/api/conversations")
                || path.startsWith("/api/groups");

        if (isInternalPath) {
            String provided = request.getHeader(HEADER);
            if (!internalKey.equals(provided)) {
                response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
                response.setContentType(MediaType.APPLICATION_JSON_VALUE);
                response.getWriter().write("{\"success\":false,\"message\":\"Unauthorized\"}");
                return;
            }
        }

        chain.doFilter(req, res);
    }
}
