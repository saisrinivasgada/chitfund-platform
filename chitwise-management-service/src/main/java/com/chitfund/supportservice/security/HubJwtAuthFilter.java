package com.chitfund.supportservice.security;

import com.chitfund.supportservice.repository.EmployeeRepository;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.http.MediaType;

import java.io.IOException;
import java.util.List;

@Component
@RequiredArgsConstructor
public class HubJwtAuthFilter extends OncePerRequestFilter {

    private final HubJwtTokenProvider hubJwtTokenProvider;
    private final EmployeeRepository employeeRepository;

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain chain) throws ServletException, IOException {
        String token = extractToken(request);

        if (StringUtils.hasText(token) && hubJwtTokenProvider.validateToken(token)) {
            String employeeId = hubJwtTokenProvider.extractEmployeeId(token);
            long tokenAuthVersion = hubJwtTokenProvider.extractAuthVersion(token);

            var employee = employeeRepository.findById(employeeId).orElse(null);
            // The database remains authoritative for activation, role, password-reset
            // restrictions and token revocation.
            if (employee != null && employee.isActive()
                    && employee.getAuthVersion() == tokenAuthVersion) {
                if (employee.isMustChangePassword() && !passwordChangeAllowed(request)) {
                    response.setStatus(HttpServletResponse.SC_FORBIDDEN);
                    response.setContentType(MediaType.APPLICATION_JSON_VALUE);
                    response.getWriter().write("{\"success\":false,\"code\":\"PASSWORD_CHANGE_REQUIRED\","
                            + "\"message\":\"Set a permanent password before continuing.\"}");
                    return;
                }
                var auth = new UsernamePasswordAuthenticationToken(
                        employeeId,
                        null,
                        List.of(new SimpleGrantedAuthority(employee.getRole()))
                );
                SecurityContextHolder.getContext().setAuthentication(auth);
            }
        }

        chain.doFilter(request, response);
    }

    private boolean passwordChangeAllowed(HttpServletRequest request) {
        String path = request.getRequestURI();
        return path.equals("/api/hub/auth/change-password")
                || path.equals("/api/hub/auth/me")
                || path.equals("/api/hub/auth/login")
                || path.equals("/api/hub/auth/accept-invite");
    }

    private String extractToken(HttpServletRequest request) {
        String header = request.getHeader("Authorization");
        if (StringUtils.hasText(header) && header.startsWith("Bearer ")) {
            return header.substring(7);
        }
        return null;
    }
}
