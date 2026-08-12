package com.chitfund.userservice.security;

import com.chitfund.common.context.TenantContext;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

/**
 * Runs once per HTTP request. Extracts the JWT from the Authorization header,
 * validates it, and sets the authentication in the SecurityContext.
 *
 * WHY OncePerRequestFilter?
 * In older Servlet containers, a filter could be invoked multiple times per request
 * (e.g. on forward/include). OncePerRequestFilter guarantees exactly one execution.
 *
 * WHY NOT session-based auth?
 * Sessions are stateful: the server must store session data and handle sticky routing
 * in clustered deployments. JWT is stateless: any instance can validate any token.
 * This is WHY microservices prefer JWT — no shared session store needed.
 *
 * FLOW per request:
 * 1. Extract "Bearer <token>" from Authorization header
 * 2. Validate token signature + expiry (no DB hit — pure crypto)
 * 3. Extract userId from token claims
 * 4. Load User from DB (to check if account is locked/disabled since token was issued)
 * 5. Set Authentication in SecurityContext → Spring Security considers the user authenticated
 * 6. Continue filter chain → request reaches the controller
 *
 * SECURITY NOTE: Step 4 adds one DB call per request. At high scale, cache the user
 * in Redis with a short TTL (matching token expiry) to eliminate this DB hit.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    private final JwtTokenProvider jwtTokenProvider;
    private final UserDetailsServiceImpl userDetailsService;

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {
        String token = extractToken(request);

        try {
            if (StringUtils.hasText(token) && jwtTokenProvider.validateToken(token)) {
                // Reject pre-scope tokens from accessing protected endpoints
                String scope = jwtTokenProvider.extractScope(token);
                if ("TENANT_SELECT".equals(scope)) {
                    filterChain.doFilter(request, response);
                    return;
                }

                String userId = jwtTokenProvider.extractUserId(token);
                UserDetails userDetails = userDetailsService.loadUserById(userId);

                UsernamePasswordAuthenticationToken authentication =
                        new UsernamePasswordAuthenticationToken(userDetails, null, userDetails.getAuthorities());
                authentication.setDetails(new WebAuthenticationDetailsSource().buildDetails(request));
                SecurityContextHolder.getContext().setAuthentication(authentication);

                String tenantId = jwtTokenProvider.extractTenantId(token);
                if (tenantId != null) TenantContext.set(tenantId);
            }

            filterChain.doFilter(request, response);
        } finally {
            TenantContext.clear();
        }
    }

    private String extractToken(HttpServletRequest request) {
        String header = request.getHeader("Authorization");
        if (StringUtils.hasText(header) && header.startsWith("Bearer ")) {
            return header.substring(7);
        }
        return null;
    }
}
