package com.chitfund.memberservice.security;

import io.jsonwebtoken.Claims;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.core.context.SecurityContextHolder;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class JwtAuthenticationFilterTest {

    private final JwtTokenProvider tokenProvider = mock(JwtTokenProvider.class);
    private final JwtAuthenticationFilter filter = new JwtAuthenticationFilter(tokenProvider);

    @AfterEach
    void clearSecurityContext() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void hubSuperAdminReceivesTheAuthorityRequiredByMemberUsageEndpoints() throws Exception {
        Claims claims = claims("SUPER_ADMIN", "HUB_SUPER_ADMIN");
        when(tokenProvider.validateToken("signed-token")).thenReturn(true);
        when(tokenProvider.extractClaims("signed-token")).thenReturn(claims);

        filter.doFilter(request(), new MockHttpServletResponse(), new MockFilterChain());

        assertThat(SecurityContextHolder.getContext().getAuthentication().getAuthorities())
                .extracting("authority")
                .containsExactlyInAnyOrder("ROLE_SUPER_ADMIN", "SUPER_ADMIN");
    }

    @Test
    void legacyUsersTableSuperAdminTokenIsNotAuthenticated() throws Exception {
        Claims claims = claims("SUPER_ADMIN", "SUPER_ADMIN");
        when(tokenProvider.validateToken("signed-token")).thenReturn(true);
        when(tokenProvider.extractClaims("signed-token")).thenReturn(claims);

        filter.doFilter(request(), new MockHttpServletResponse(), new MockFilterChain());

        assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
    }

    private Claims claims(String role, String scope) {
        Claims claims = mock(Claims.class);
        when(claims.getSubject()).thenReturn("77715cc1-cbaa-3c8c-bac8-884737c4687e");
        when(claims.get("role", String.class)).thenReturn(role);
        when(claims.get("scope", String.class)).thenReturn(scope);
        return claims;
    }

    private MockHttpServletRequest request() {
        MockHttpServletRequest request =
                new MockHttpServletRequest("GET", "/api/super-admin/members/usage-summary");
        request.addHeader("Authorization", "Bearer signed-token");
        return request;
    }
}
