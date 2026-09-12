package com.chitfund.userservice.security;

import com.chitfund.userservice.client.HubIdentityClient;
import com.chitfund.userservice.domain.entity.User;
import io.jsonwebtoken.Claims;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class JwtAuthenticationFilterTest {

    @Mock JwtTokenProvider tokenProvider;
    @Mock UserDetailsServiceImpl userDetailsService;
    @Mock HubIdentityClient hubIdentityClient;

    @AfterEach
    void clearSecurityContext() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void acceptsLiveHubSuperAdminWithoutAUserTableAccount() throws Exception {
        Claims claims = mock(Claims.class);
        when(tokenProvider.validateToken("hub-saas-token")).thenReturn(true);
        when(tokenProvider.extractScope("hub-saas-token")).thenReturn("HUB_SUPER_ADMIN");
        when(tokenProvider.extractClaims("hub-saas-token")).thenReturn(claims);
        when(claims.get("hubEmployeeId", String.class)).thenReturn("EMP-001");
        when(claims.get("authVersion", Number.class)).thenReturn(7L);
        when(claims.getSubject()).thenReturn("77715cc1-cbaa-3c8c-bac8-884737c4687e");
        when(hubIdentityClient.getAuthState("EMP-001")).thenReturn(Optional.of(
                new HubIdentityClient.HubAuthState(
                        "EMP-001", "owner", "Owner", "owner@example.com",
                        "SUPER_ADMIN", true, false, 7L)));

        var request = requestWithToken();
        new JwtAuthenticationFilter(tokenProvider, userDetailsService, hubIdentityClient)
                .doFilter(request, new MockHttpServletResponse(), new MockFilterChain());

        var auth = SecurityContextHolder.getContext().getAuthentication();
        assertThat(auth).isNotNull();
        assertThat(auth.getPrincipal()).isInstanceOf(User.class);
        assertThat(auth.getAuthorities()).extracting("authority").containsExactly("SUPER_ADMIN");
    }

    @Test
    void rejectsStaleHubSaasTokenAfterPasswordReset() throws Exception {
        Claims claims = mock(Claims.class);
        when(tokenProvider.validateToken("hub-saas-token")).thenReturn(true);
        when(tokenProvider.extractScope("hub-saas-token")).thenReturn("HUB_SUPER_ADMIN");
        when(tokenProvider.extractClaims("hub-saas-token")).thenReturn(claims);
        when(claims.get("hubEmployeeId", String.class)).thenReturn("EMP-001");
        when(claims.get("authVersion", Number.class)).thenReturn(6L);
        when(hubIdentityClient.getAuthState("EMP-001")).thenReturn(Optional.of(
                new HubIdentityClient.HubAuthState(
                        "EMP-001", "owner", "Owner", "owner@example.com",
                        "SUPER_ADMIN", true, false, 7L)));

        new JwtAuthenticationFilter(tokenProvider, userDetailsService, hubIdentityClient)
                .doFilter(requestWithToken(), new MockHttpServletResponse(), new MockFilterChain());

        assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
    }

    private MockHttpServletRequest requestWithToken() {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/super-admin/tenants");
        request.addHeader("Authorization", "Bearer hub-saas-token");
        return request;
    }
}
