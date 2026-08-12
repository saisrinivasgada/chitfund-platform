package com.chitfund.memberservice.security;

import com.chitfund.common.context.PlanContext;
import com.chitfund.common.context.TenantContext;
import io.jsonwebtoken.Claims;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.List;
import java.util.UUID;

@Component
@RequiredArgsConstructor
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    private final JwtTokenProvider jwtTokenProvider;

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain chain) throws ServletException, IOException {
        String token = extractToken(request);
        try {
            if (StringUtils.hasText(token) && jwtTokenProvider.validateToken(token)) {
                Claims claims = jwtTokenProvider.extractClaims(token);
                UUID userId   = UUID.fromString(claims.getSubject());
                String role      = claims.get("role",       String.class);
                String username  = claims.get("username",  String.class);
                String tenantId  = claims.get("tenantId",  String.class);
                String tenantPlan= claims.get("tenantPlan",String.class);

                UsernamePasswordAuthenticationToken auth = new UsernamePasswordAuthenticationToken(
                        userId, username, List.of(new SimpleGrantedAuthority("ROLE_" + role)));
                auth.setDetails(new WebAuthenticationDetailsSource().buildDetails(request));
                SecurityContextHolder.getContext().setAuthentication(auth);

                if (tenantId != null)   TenantContext.set(tenantId);
                if (tenantPlan != null) PlanContext.set(tenantPlan);

                String tenantStatus = claims.get("tenantStatus", String.class);
                if (("PENDING".equals(tenantStatus) || "SUSPENDED".equals(tenantStatus)) && isWriteMethod(request.getMethod())) {
                    response.setStatus(HttpServletResponse.SC_FORBIDDEN);
                    response.setContentType("application/json");
                    response.getWriter().write("{\"error\":\"Organisation inactive\",\"message\":\"This organisation is " + ("PENDING".equals(tenantStatus) ? "pending activation" : "suspended") + ".\"}");
                    return;
                }
            }
            chain.doFilter(request, response);
        } finally {
            TenantContext.clear();
            PlanContext.clear();
        }
    }

    private static boolean isWriteMethod(String method) {
        return "POST".equals(method) || "PUT".equals(method) || "DELETE".equals(method) || "PATCH".equals(method);
    }

    private String extractToken(HttpServletRequest request) {
        String header = request.getHeader("Authorization");
        if (StringUtils.hasText(header) && header.startsWith("Bearer ")) {
            return header.substring(7);
        }
        return null;
    }
}
