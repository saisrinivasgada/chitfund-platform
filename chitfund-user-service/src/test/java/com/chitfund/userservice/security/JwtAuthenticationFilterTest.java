package com.chitfund.userservice.security;

import com.chitfund.userservice.client.HubIdentityClient;
import com.chitfund.userservice.domain.entity.User;
import com.chitfund.userservice.domain.enums.Role;
import com.chitfund.userservice.repository.MemberUserLinkRepository;
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
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class JwtAuthenticationFilterTest {

    @Mock JwtTokenProvider tokenProvider;
    @Mock UserDetailsServiceImpl userDetailsService;
    @Mock HubIdentityClient hubIdentityClient;
    @Mock MemberUserLinkRepository memberLinkRepository;

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
                        "SUPER_ADMIN", true, false, 7L, true)));

        var request = requestWithToken();
        new JwtAuthenticationFilter(tokenProvider, userDetailsService, hubIdentityClient, memberLinkRepository)
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
                        "SUPER_ADMIN", true, false, 7L, true)));

        new JwtAuthenticationFilter(tokenProvider, userDetailsService, hubIdentityClient, memberLinkRepository)
                .doFilter(requestWithToken(), new MockHttpServletResponse(), new MockFilterChain());

        assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
    }

    @Test
    void acceptsSupportEmployeeWithExplicitPlatformConsoleCapability() throws Exception {
        Claims claims = mock(Claims.class);
        when(tokenProvider.validateToken("hub-saas-token")).thenReturn(true);
        when(tokenProvider.extractScope("hub-saas-token")).thenReturn("HUB_SUPER_ADMIN");
        when(tokenProvider.extractClaims("hub-saas-token")).thenReturn(claims);
        when(claims.get("hubEmployeeId", String.class)).thenReturn("EMP-001");
        when(claims.get("authVersion", Number.class)).thenReturn(7L);
        when(claims.getSubject()).thenReturn("77715cc1-cbaa-3c8c-bac8-884737c4687e");
        when(hubIdentityClient.getAuthState("EMP-001")).thenReturn(Optional.of(
                new HubIdentityClient.HubAuthState(
                        "EMP-001", "agent", "Support Agent", "agent@example.com",
                        "SUPPORT_AGENT", true, false, 7L, true)));

        new JwtAuthenticationFilter(tokenProvider, userDetailsService, hubIdentityClient, memberLinkRepository)
                .doFilter(requestWithToken(), new MockHttpServletResponse(), new MockFilterChain());

        assertThat(SecurityContextHolder.getContext().getAuthentication())
                .isNotNull();
    }

    @Test
    void rejectsSupportEmployeeWithoutPlatformConsoleCapability() throws Exception {
        Claims claims = mock(Claims.class);
        when(tokenProvider.validateToken("hub-saas-token")).thenReturn(true);
        when(tokenProvider.extractScope("hub-saas-token")).thenReturn("HUB_SUPER_ADMIN");
        when(tokenProvider.extractClaims("hub-saas-token")).thenReturn(claims);
        when(claims.get("hubEmployeeId", String.class)).thenReturn("EMP-001");
        when(claims.get("authVersion", Number.class)).thenReturn(7L);
        when(hubIdentityClient.getAuthState("EMP-001")).thenReturn(Optional.of(
                new HubIdentityClient.HubAuthState(
                        "EMP-001", "agent", "Support Agent", "agent@example.com",
                        "SUPPORT_AGENT", true, false, 7L, false)));

        new JwtAuthenticationFilter(tokenProvider, userDetailsService, hubIdentityClient, memberLinkRepository)
                .doFilter(requestWithToken(), new MockHttpServletResponse(), new MockFilterChain());

        assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
    }

    @Test
    void rejectsLegacyUsersTableSuperAdminToken() throws Exception {
        Claims claims = mock(Claims.class);
        when(tokenProvider.validateToken("hub-saas-token")).thenReturn(true);
        when(tokenProvider.extractScope("hub-saas-token")).thenReturn("SUPER_ADMIN");
        when(tokenProvider.extractClaims("hub-saas-token")).thenReturn(claims);
        when(claims.get("role", String.class)).thenReturn("SUPER_ADMIN");

        new JwtAuthenticationFilter(tokenProvider, userDetailsService, hubIdentityClient, memberLinkRepository)
                .doFilter(requestWithToken(), new MockHttpServletResponse(), new MockFilterChain());

        assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
    }

    // ─── Member-link suspension check ────────────────────────────────────────────

    @Test
    void suspendedMemberWithMissingLinkIsRejectedImmediately() throws Exception {
        UUID userId = UUID.randomUUID();
        UUID tenantId = UUID.randomUUID();
        User member = User.builder().id(userId).username("member1")
                .passwordHash("hash").role(Role.MEMBER).build();
        Claims claims = mock(Claims.class);
        when(tokenProvider.validateToken("member-token")).thenReturn(true);
        when(tokenProvider.extractScope("member-token")).thenReturn("CHITWISE");
        when(tokenProvider.extractClaims("member-token")).thenReturn(claims);
        when(claims.get("role", String.class)).thenReturn(null);
        when(tokenProvider.extractUserId("member-token")).thenReturn(userId.toString());
        when(userDetailsService.loadUserById(userId.toString())).thenReturn(member);
        when(tokenProvider.extractTenantId("member-token")).thenReturn(tenantId.toString());
        when(memberLinkRepository.existsByUserIdAndTenantId(userId, tenantId)).thenReturn(false);

        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/member/chits");
        request.addHeader("Authorization", "Bearer member-token");
        new JwtAuthenticationFilter(tokenProvider, userDetailsService, hubIdentityClient, memberLinkRepository)
                .doFilter(request, new MockHttpServletResponse(), new MockFilterChain());

        assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
    }

    @Test
    void activeMemberWithValidLinkPassesAuthentication() throws Exception {
        UUID userId = UUID.randomUUID();
        UUID tenantId = UUID.randomUUID();
        User member = User.builder().id(userId).username("member2")
                .passwordHash("hash").role(Role.MEMBER).build();
        Claims claims = mock(Claims.class);
        when(tokenProvider.validateToken("member-token")).thenReturn(true);
        when(tokenProvider.extractScope("member-token")).thenReturn("CHITWISE");
        when(tokenProvider.extractClaims("member-token")).thenReturn(claims);
        when(claims.get("role", String.class)).thenReturn(null);
        when(tokenProvider.extractUserId("member-token")).thenReturn(userId.toString());
        when(userDetailsService.loadUserById(userId.toString())).thenReturn(member);
        when(tokenProvider.extractTenantId("member-token")).thenReturn(tenantId.toString());
        when(memberLinkRepository.existsByUserIdAndTenantId(userId, tenantId)).thenReturn(true);

        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/member/chits");
        request.addHeader("Authorization", "Bearer member-token");
        new JwtAuthenticationFilter(tokenProvider, userDetailsService, hubIdentityClient, memberLinkRepository)
                .doFilter(request, new MockHttpServletResponse(), new MockFilterChain());

        assertThat(SecurityContextHolder.getContext().getAuthentication()).isNotNull();
    }

    @Test
    void adminTokenWithTenantScopeIsNotCheckedAgainstMemberLink() throws Exception {
        UUID userId = UUID.randomUUID();
        UUID tenantId = UUID.randomUUID();
        User admin = User.builder().id(userId).username("admin1")
                .passwordHash("hash").role(Role.ADMIN).tenantId(tenantId.toString()).build();
        Claims claims = mock(Claims.class);
        when(tokenProvider.validateToken("admin-token")).thenReturn(true);
        when(tokenProvider.extractScope("admin-token")).thenReturn("CHITWISE");
        when(tokenProvider.extractClaims("admin-token")).thenReturn(claims);
        when(claims.get("role", String.class)).thenReturn(null);
        when(tokenProvider.extractUserId("admin-token")).thenReturn(userId.toString());
        when(userDetailsService.loadUserById(userId.toString())).thenReturn(admin);
        when(tokenProvider.extractTenantId("admin-token")).thenReturn(tenantId.toString());

        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/admin/members");
        request.addHeader("Authorization", "Bearer admin-token");
        new JwtAuthenticationFilter(tokenProvider, userDetailsService, hubIdentityClient, memberLinkRepository)
                .doFilter(request, new MockHttpServletResponse(), new MockFilterChain());

        assertThat(SecurityContextHolder.getContext().getAuthentication()).isNotNull();
        verify(memberLinkRepository, never()).existsByUserIdAndTenantId(any(), any());
    }

    @Test
    void memberWithActiveLinkIsAuthenticated() throws Exception {
        UUID userId = UUID.fromString("aaaaaaaa-0000-0000-0000-000000000001");
        UUID tenantId = UUID.fromString("bbbbbbbb-0000-0000-0000-000000000002");
        User member = User.builder().id(userId).role(Role.MEMBER).enabled(true)
                .username("member1").passwordHash("x").build();

        Claims claims = mock(Claims.class);
        when(tokenProvider.validateToken("member-token")).thenReturn(true);
        when(tokenProvider.extractScope("member-token")).thenReturn("FULL_ACCESS");
        when(tokenProvider.extractClaims("member-token")).thenReturn(claims);
        when(claims.get("role", String.class)).thenReturn("MEMBER");
        when(tokenProvider.extractUserId("member-token")).thenReturn(userId.toString());
        when(userDetailsService.loadUserById(userId.toString())).thenReturn(member);
        when(tokenProvider.extractTenantId("member-token")).thenReturn(tenantId.toString());
        when(memberLinkRepository.existsByUserIdAndTenantId(userId, tenantId)).thenReturn(true);

        var request = new MockHttpServletRequest("GET", "/api/member/dashboard");
        request.addHeader("Authorization", "Bearer member-token");
        new JwtAuthenticationFilter(tokenProvider, userDetailsService, hubIdentityClient, memberLinkRepository)
                .doFilter(request, new MockHttpServletResponse(), new MockFilterChain());

        assertThat(SecurityContextHolder.getContext().getAuthentication()).isNotNull();
        verify(memberLinkRepository).existsByUserIdAndTenantId(userId, tenantId);
    }

    @Test
    void suspendedMemberWithRemovedLinkIsRejectedImmediately() throws Exception {
        UUID userId = UUID.fromString("aaaaaaaa-0000-0000-0000-000000000001");
        UUID tenantId = UUID.fromString("bbbbbbbb-0000-0000-0000-000000000002");
        User member = User.builder().id(userId).role(Role.MEMBER).enabled(true)
                .username("member1").passwordHash("x").build();

        Claims claims = mock(Claims.class);
        when(tokenProvider.validateToken("member-token")).thenReturn(true);
        when(tokenProvider.extractScope("member-token")).thenReturn("FULL_ACCESS");
        when(tokenProvider.extractClaims("member-token")).thenReturn(claims);
        when(claims.get("role", String.class)).thenReturn("MEMBER");
        when(tokenProvider.extractUserId("member-token")).thenReturn(userId.toString());
        when(userDetailsService.loadUserById(userId.toString())).thenReturn(member);
        when(tokenProvider.extractTenantId("member-token")).thenReturn(tenantId.toString());
        // Link was deleted when suspension happened
        when(memberLinkRepository.existsByUserIdAndTenantId(userId, tenantId)).thenReturn(false);

        var request = new MockHttpServletRequest("GET", "/api/member/dashboard");
        request.addHeader("Authorization", "Bearer member-token");
        new JwtAuthenticationFilter(tokenProvider, userDetailsService, hubIdentityClient, memberLinkRepository)
                .doFilter(request, new MockHttpServletResponse(), new MockFilterChain());

        // Authentication must be cleared — suspension is immediate, no waiting for token expiry
        assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
    }

    private MockHttpServletRequest requestWithToken() {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/super-admin/tenants");
        request.addHeader("Authorization", "Bearer hub-saas-token");
        return request;
    }
}
