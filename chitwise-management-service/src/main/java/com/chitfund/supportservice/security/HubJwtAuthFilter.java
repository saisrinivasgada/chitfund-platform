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
            String role = hubJwtTokenProvider.extractRole(token);

            // Reject deactivated employees even if their JWT is still valid
            boolean isActive = employeeRepository.findById(employeeId)
                    .map(e -> e.isActive()).orElse(false);
            if (isActive) {
                var auth = new UsernamePasswordAuthenticationToken(
                        employeeId,
                        null,
                        List.of(new SimpleGrantedAuthority(role))
                );
                SecurityContextHolder.getContext().setAuthentication(auth);
            }
        }

        chain.doFilter(request, response);
    }

    private String extractToken(HttpServletRequest request) {
        String header = request.getHeader("Authorization");
        if (StringUtils.hasText(header) && header.startsWith("Bearer ")) {
            return header.substring(7);
        }
        return null;
    }
}
