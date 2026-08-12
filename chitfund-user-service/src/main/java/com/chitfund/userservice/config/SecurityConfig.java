package com.chitfund.userservice.config;

import com.chitfund.common.exception.ErrorCode;
import com.chitfund.userservice.security.JwtAuthenticationFilter;
import com.chitfund.userservice.security.UserDetailsServiceImpl;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.dao.DaoAuthenticationProvider;
import org.springframework.security.config.annotation.authentication.configuration.AuthenticationConfiguration;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

import java.util.Map;

/**
 * Spring Security configuration for the user-service.
 *
 * KEY DECISIONS:
 *
 * 1. CSRF disabled: CSRF protects browser-based session auth (cookies). We use
 *    stateless JWT in Authorization header — CSRF attacks don't apply.
 *    NEVER disable CSRF on a session-based app.
 *
 * 2. SessionCreationPolicy.STATELESS: Spring Security won't create or use HTTP sessions.
 *    Auth state lives entirely in the JWT. Enables horizontal scaling with no sticky sessions.
 *
 * 3. @EnableMethodSecurity: Enables @PreAuthorize on controller methods.
 *    Allows fine-grained "ADMIN only" or "ADMIN or MANAGER" authorization per endpoint.
 *    Replaces the deprecated @EnableGlobalMethodSecurity from Spring Security 5.
 *
 * 4. DaoAuthenticationProvider: The standard provider that uses UserDetailsService to
 *    load the user and PasswordEncoder to verify the password. Used by AuthenticationManager
 *    during /api/auth/login.
 *
 * 5. AuthenticationEntryPoint + AccessDeniedHandler: These handle auth failures that
 *    happen INSIDE the filter chain (before controllers). The GlobalExceptionHandler
 *    handles exceptions thrown inside controllers. Both must return our ApiResponse envelope.
 *
 * INTERVIEW: "Spring Security is a chain of filters. Each filter handles a concern:
 * CORS, CSRF, authentication, authorization. Our JwtAuthenticationFilter slots in
 * before UsernamePasswordAuthenticationFilter to handle Bearer token auth."
 */
@Configuration
@EnableWebSecurity
@EnableMethodSecurity
@RequiredArgsConstructor
public class SecurityConfig {

    private final JwtAuthenticationFilter jwtAuthenticationFilter;
    private final UserDetailsServiceImpl userDetailsService;
    private final ObjectMapper objectMapper;

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
            .csrf(AbstractHttpConfigurer::disable)
            .sessionManagement(session ->
                session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/api/auth/**").permitAll()
                .requestMatchers("/api/plans/**").permitAll()
                .requestMatchers("/api/public/**").permitAll()
                .requestMatchers("/actuator/health").permitAll()
                .requestMatchers("/internal/**").permitAll()
                .requestMatchers("/api/super-admin/**").hasAuthority("SUPER_ADMIN")
                .anyRequest().authenticated()
            )
            .exceptionHandling(ex -> ex
                .authenticationEntryPoint((request, response, authException) -> {
                    response.setStatus(HttpStatus.UNAUTHORIZED.value());
                    response.setContentType(MediaType.APPLICATION_JSON_VALUE);
                    response.getWriter().write(objectMapper.writeValueAsString(
                        Map.of("success", false,
                               "errorCode", ErrorCode.UNAUTHORIZED.getCode(),
                               "message", "Authentication required")));
                })
                .accessDeniedHandler((request, response, accessDeniedException) -> {
                    response.setStatus(HttpStatus.FORBIDDEN.value());
                    response.setContentType(MediaType.APPLICATION_JSON_VALUE);
                    response.getWriter().write(objectMapper.writeValueAsString(
                        Map.of("success", false,
                               "errorCode", ErrorCode.FORBIDDEN.getCode(),
                               "message", "Access denied — insufficient permissions")));
                })
            )
            .authenticationProvider(authenticationProvider())
            .addFilterBefore(jwtAuthenticationFilter, UsernamePasswordAuthenticationFilter.class);

        return http.build();
    }

    @Bean
    public DaoAuthenticationProvider authenticationProvider() {
        DaoAuthenticationProvider provider = new DaoAuthenticationProvider();
        provider.setUserDetailsService(userDetailsService);
        provider.setPasswordEncoder(passwordEncoder());
        return provider;
    }

    @Bean
    public AuthenticationManager authenticationManager(AuthenticationConfiguration config) throws Exception {
        return config.getAuthenticationManager();
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        // BCrypt: adaptive one-way hash. Cost factor 10 = ~100ms per hash on modern hardware.
        // Too fast (< 10ms) = brute-forceable. Too slow (> 500ms) = bad UX.
        // BCrypt automatically salts each hash — no separate salt column needed.
        return new BCryptPasswordEncoder();
    }
}
