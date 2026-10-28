package com.chitfund.gateway.filter;

import com.chitfund.gateway.client.HubIdentityClient;
import com.chitfund.gateway.client.MemberAccessClient;
import com.chitfund.gateway.client.TenantEntitlementClient;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.mock.http.server.reactive.MockServerHttpRequest;
import org.springframework.mock.web.server.MockServerWebExchange;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.Date;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class JwtAuthGatewayFilterTest {
    private static final String SECRET = "gateway-test-secret-at-least-thirty-two-characters";
    private JwtAuthGatewayFilter factory;
    private HubIdentityClient hubIdentityClient;
    private TenantEntitlementClient tenantEntitlementClient;
    private MemberAccessClient memberAccessClient;

    @BeforeEach
    void setUp() {
        hubIdentityClient = mock(HubIdentityClient.class);
        tenantEntitlementClient = mock(TenantEntitlementClient.class);
        memberAccessClient = mock(MemberAccessClient.class);
        factory = new JwtAuthGatewayFilter(hubIdentityClient, tenantEntitlementClient, memberAccessClient);
        ReflectionTestUtils.setField(factory, "jwtSecret", SECRET);
        ReflectionTestUtils.setField(factory, "internalServiceKey", "trusted-internal-key");
    }

    @Test
    void rejectsLegacyUsersTableSuperAdminToken() {
        String token = token("legacy-user", "SUPER_ADMIN", null);
        GatewayFilterChain chain = mock(GatewayFilterChain.class);
        var exchange = MockServerWebExchange.from(MockServerHttpRequest.get("/api/super-admin/tenants")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token));

        factory.apply(new JwtAuthGatewayFilter.Config()).filter(exchange, chain).block();

        assertThat(exchange.getResponse().getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        verify(chain, never()).filter(any());
    }

    @Test
    void acceptsHubSuperAdminAndReplacesSpoofedIdentityHeaders() {
        String token = token("employee-1", "SUPER_ADMIN", "HUB_SUPER_ADMIN");
        when(hubIdentityClient.getAuthState("EMP-001")).thenReturn(Mono.just(
                new HubIdentityClient.HubAuthState(
                        "EMP-001", "SUPER_ADMIN", true, false, 7L, true)));
        GatewayFilterChain chain = mock(GatewayFilterChain.class);
        when(chain.filter(any())).thenReturn(Mono.empty());
        var exchange = MockServerWebExchange.from(MockServerHttpRequest.get("/api/super-admin/tenants")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .header("X-User-Id", "attacker")
                .header("X-User-Role", "ADMIN")
                .header("X-Internal-Auth", "attacker-key")
                .header("X-Internal-Key", "caller-controlled-key"));

        factory.apply(new JwtAuthGatewayFilter.Config()).filter(exchange, chain).block();

        ArgumentCaptor<ServerWebExchange> forwarded = ArgumentCaptor.forClass(ServerWebExchange.class);
        verify(chain).filter(forwarded.capture());
        var headers = forwarded.getValue().getRequest().getHeaders();
        assertThat(headers.getFirst("X-User-Id")).isEqualTo("employee-1");
        assertThat(headers.getFirst("X-User-Role")).isEqualTo("SUPER_ADMIN");
        assertThat(headers.getFirst("X-Internal-Auth")).isEqualTo("trusted-internal-key");
        assertThat(headers.containsKey("X-Internal-Key")).isFalse();
    }

    @Test
    void rejectsHubTokenAfterEmployeeAuthVersionChanges() {
        String token = token("employee-1", "SUPER_ADMIN", "HUB_SUPER_ADMIN");
        when(hubIdentityClient.getAuthState("EMP-001")).thenReturn(Mono.just(
                new HubIdentityClient.HubAuthState(
                        "EMP-001", "SUPER_ADMIN", true, false, 8L, true)));
        GatewayFilterChain chain = mock(GatewayFilterChain.class);
        var exchange = MockServerWebExchange.from(MockServerHttpRequest
                .get("/api/audit/super-admin/logs")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token));

        factory.apply(new JwtAuthGatewayFilter.Config()).filter(exchange, chain).block();

        assertThat(exchange.getResponse().getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        verify(chain, never()).filter(any());
    }

    @Test
    void acceptsCurrentEmployeeWithExplicitPlatformConsoleAddOn() {
        String token = token("employee-1", "SUPER_ADMIN", "HUB_SUPER_ADMIN");
        when(hubIdentityClient.getAuthState("EMP-001")).thenReturn(Mono.just(
                new HubIdentityClient.HubAuthState(
                        "EMP-001", "SUPPORT_AGENT", true, false, 7L, true)));
        GatewayFilterChain chain = mock(GatewayFilterChain.class);
        when(chain.filter(any())).thenReturn(Mono.empty());
        var exchange = MockServerWebExchange.from(MockServerHttpRequest
                .get("/api/super-admin/tenants")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token));

        factory.apply(new JwtAuthGatewayFilter.Config()).filter(exchange, chain).block();

        verify(chain).filter(any());
    }

    @Test
    void rejectsSupportEmployeeWithoutPlatformConsoleAddOn() {
        String token = token("employee-1", "SUPER_ADMIN", "HUB_SUPER_ADMIN");
        when(hubIdentityClient.getAuthState("EMP-001")).thenReturn(Mono.just(
                new HubIdentityClient.HubAuthState(
                        "EMP-001", "SUPPORT_AGENT", true, false, 7L, false)));
        GatewayFilterChain chain = mock(GatewayFilterChain.class);
        var exchange = MockServerWebExchange.from(MockServerHttpRequest
                .get("/api/super-admin/tenants")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token));

        factory.apply(new JwtAuthGatewayFilter.Config()).filter(exchange, chain).block();

        assertThat(exchange.getResponse().getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        verify(chain, never()).filter(any());
    }

    @Test
    void failsClosedWhenHubIdentityAuthorityIsUnavailable() {
        String token = token("employee-1", "SUPER_ADMIN", "HUB_SUPER_ADMIN");
        when(hubIdentityClient.getAuthState("EMP-001"))
                .thenReturn(Mono.error(new IllegalStateException("unavailable")));
        GatewayFilterChain chain = mock(GatewayFilterChain.class);
        var exchange = MockServerWebExchange.from(MockServerHttpRequest
                .get("/api/super-admin/tenants")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token));

        factory.apply(new JwtAuthGatewayFilter.Config()).filter(exchange, chain).block();

        assertThat(exchange.getResponse().getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        verify(chain, never()).filter(any());
    }

    @Test
    void downstreamFailureIsNotMisreportedAsAnAuthenticationFailure() {
        String token = token("employee-1", "SUPER_ADMIN", "HUB_SUPER_ADMIN");
        when(hubIdentityClient.getAuthState("EMP-001")).thenReturn(Mono.just(
                new HubIdentityClient.HubAuthState(
                        "EMP-001", "SUPER_ADMIN", true, false, 7L, true)));
        GatewayFilterChain chain = mock(GatewayFilterChain.class);
        when(chain.filter(any())).thenReturn(Mono.error(
                new IllegalStateException("downstream unavailable")));
        var exchange = MockServerWebExchange.from(MockServerHttpRequest
                .get("/api/super-admin/tenants")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token));

        assertThatThrownBy(() -> factory.apply(new JwtAuthGatewayFilter.Config())
                .filter(exchange, chain).block())
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("downstream unavailable");
    }

    @Test
    void activeTenantCanPerformOperationalWrite() {
        String token = tenantToken("admin-1", "ADMIN", "tenant-1");
        when(tenantEntitlementClient.getEffectiveEntitlement("tenant-1"))
                .thenReturn(Mono.just(new TenantEntitlementClient.TenantEntitlement(
                        "ACTIVE", LocalDateTime.now().plusDays(5).toString())));
        GatewayFilterChain chain = mock(GatewayFilterChain.class);
        when(chain.filter(any())).thenReturn(Mono.empty());
        var exchange = MockServerWebExchange.from(MockServerHttpRequest
                .post("/api/payments")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token));

        factory.apply(new JwtAuthGatewayFilter.Config()).filter(exchange, chain).block();

        verify(chain).filter(any());
    }

    @Test
    void expiredTenantCannotBypassWriteGateWithValidStaleToken() {
        String token = tenantToken("admin-1", "ADMIN", "tenant-1");
        when(tenantEntitlementClient.getEffectiveEntitlement("tenant-1"))
                .thenReturn(Mono.just(new TenantEntitlementClient.TenantEntitlement(
                        "ACTIVE", LocalDateTime.now().minusMinutes(1).toString())));
        GatewayFilterChain chain = mock(GatewayFilterChain.class);
        var exchange = MockServerWebExchange.from(MockServerHttpRequest
                .post("/api/chits")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token));

        factory.apply(new JwtAuthGatewayFilter.Config()).filter(exchange, chain).block();

        assertThat(exchange.getResponse().getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
        assertThat(exchange.getResponse().getBodyAsString().block()).contains("PLAN_002");
        verify(chain, never()).filter(any());
    }

    @Test
    void suspendedTenantIsReadOnlyEvenWhenJwtStillSaysActive() {
        String token = tenantToken("admin-1", "ADMIN", "tenant-1");
        when(tenantEntitlementClient.getEffectiveEntitlement("tenant-1"))
                .thenReturn(Mono.just(new TenantEntitlementClient.TenantEntitlement(
                        "SUSPENDED", LocalDateTime.now().plusDays(5).toString())));
        GatewayFilterChain chain = mock(GatewayFilterChain.class);
        var exchange = MockServerWebExchange.from(MockServerHttpRequest
                .patch("/api/members/member-1/status")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token));

        factory.apply(new JwtAuthGatewayFilter.Config()).filter(exchange, chain).block();

        assertThat(exchange.getResponse().getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
        assertThat(exchange.getResponse().getBodyAsString().block()).contains("TENANT_INACTIVE");
        verify(chain, never()).filter(any());
    }

    @Test
    void entitlementOutageFailsClosedWithoutHidingLaterDownstreamFailures() {
        String token = tenantToken("admin-1", "ADMIN", "tenant-1");
        when(tenantEntitlementClient.getEffectiveEntitlement("tenant-1"))
                .thenReturn(Mono.error(new IllegalStateException("user service unavailable")));
        GatewayFilterChain chain = mock(GatewayFilterChain.class);
        var exchange = MockServerWebExchange.from(MockServerHttpRequest
                .post("/api/payments")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token));

        factory.apply(new JwtAuthGatewayFilter.Config()).filter(exchange, chain).block();

        assertThat(exchange.getResponse().getStatusCode()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
        assertThat(exchange.getResponse().getBodyAsString().block())
                .contains("PLAN_VERIFICATION_UNAVAILABLE");
        verify(chain, never()).filter(any());

        when(tenantEntitlementClient.getEffectiveEntitlement("tenant-1"))
                .thenReturn(Mono.just(new TenantEntitlementClient.TenantEntitlement("ACTIVE", null)));
        when(chain.filter(any())).thenReturn(Mono.error(new IllegalStateException("downstream unavailable")));
        var secondExchange = MockServerWebExchange.from(MockServerHttpRequest
                .post("/api/payments")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token));
        assertThatThrownBy(() -> factory.apply(new JwtAuthGatewayFilter.Config())
                .filter(secondExchange, chain).block())
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("downstream unavailable");
    }

    @Test
    void emptyEntitlementResponseFailsClosed() {
        String token = tenantToken("admin-1", "ADMIN", "tenant-1");
        when(tenantEntitlementClient.getEffectiveEntitlement("tenant-1"))
                .thenReturn(Mono.empty());
        GatewayFilterChain chain = mock(GatewayFilterChain.class);
        var exchange = MockServerWebExchange.from(MockServerHttpRequest
                .post("/api/payments")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token));

        factory.apply(new JwtAuthGatewayFilter.Config()).filter(exchange, chain).block();

        assertThat(exchange.getResponse().getStatusCode()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
        verify(chain, never()).filter(any());
    }

    @Test
    void expiredTenantCanStillRenewOpenTicketsAndMaintainAccountSecurity() {
        String token = tenantToken("admin-1", "ADMIN", "tenant-1");
        GatewayFilterChain chain = mock(GatewayFilterChain.class);
        when(chain.filter(any())).thenReturn(Mono.empty());

        for (String path : new String[]{
                "/api/plans/renewal-request",
                "/api/tickets",
                "/api/tickets/ticket-1/messages",
                "/api/users/me/change-password"}) {
            var exchange = MockServerWebExchange.from(MockServerHttpRequest
                    .post(path).header(HttpHeaders.AUTHORIZATION, "Bearer " + token));
            factory.apply(new JwtAuthGatewayFilter.Config()).filter(exchange, chain).block();
        }

        verify(tenantEntitlementClient, never()).getEffectiveEntitlement(any());
        verify(chain, org.mockito.Mockito.times(4)).filter(any());
    }

    @Test
    void activeMemberTokenIsForwardedToDownstreamService() {
        String token = memberToken("member-1", "tenant-1");
        when(memberAccessClient.isMemberActive("member-1", "tenant-1")).thenReturn(Mono.just(true));
        GatewayFilterChain chain = mock(GatewayFilterChain.class);
        when(chain.filter(any())).thenReturn(Mono.empty());
        var exchange = MockServerWebExchange.from(MockServerHttpRequest
                .get("/api/chits")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token));

        factory.apply(new JwtAuthGatewayFilter.Config()).filter(exchange, chain).block();

        verify(chain).filter(any());
        assertThat(exchange.getResponse().getStatusCode()).isNull();
    }

    @Test
    void suspendedMemberTokenIsRejectedImmediately() {
        String token = memberToken("member-1", "tenant-1");
        when(memberAccessClient.isMemberActive("member-1", "tenant-1")).thenReturn(Mono.just(false));
        GatewayFilterChain chain = mock(GatewayFilterChain.class);
        var exchange = MockServerWebExchange.from(MockServerHttpRequest
                .get("/api/chits")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token));

        factory.apply(new JwtAuthGatewayFilter.Config()).filter(exchange, chain).block();

        assertThat(exchange.getResponse().getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        verify(chain, never()).filter(any());
    }

    @Test
    void memberAccessAuthorityUnavailableFailsClosed() {
        String token = memberToken("member-1", "tenant-1");
        when(memberAccessClient.isMemberActive("member-1", "tenant-1"))
                .thenReturn(Mono.error(new IllegalStateException("user-service unavailable")));
        GatewayFilterChain chain = mock(GatewayFilterChain.class);
        var exchange = MockServerWebExchange.from(MockServerHttpRequest
                .get("/api/chits")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token));

        factory.apply(new JwtAuthGatewayFilter.Config()).filter(exchange, chain).block();

        assertThat(exchange.getResponse().getStatusCode()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
        assertThat(exchange.getResponse().getBodyAsString().block()).contains("MEMBER_ACCESS_UNAVAILABLE");
        verify(chain, never()).filter(any());
    }

    @Test
    void suspensionInOrgADoesNotAffectOrgBToken() {
        // Org A token: suspended
        String orgAToken = memberToken("member-1", "org-A");
        when(memberAccessClient.isMemberActive("member-1", "org-A")).thenReturn(Mono.just(false));
        GatewayFilterChain chain = mock(GatewayFilterChain.class);
        when(chain.filter(any())).thenReturn(Mono.empty());
        var orgAExchange = MockServerWebExchange.from(MockServerHttpRequest
                .get("/api/chits")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + orgAToken));
        factory.apply(new JwtAuthGatewayFilter.Config()).filter(orgAExchange, chain).block();
        assertThat(orgAExchange.getResponse().getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);

        // Org B token for same user: still active
        String orgBToken = memberToken("member-1", "org-B");
        when(memberAccessClient.isMemberActive("member-1", "org-B")).thenReturn(Mono.just(true));
        var orgBExchange = MockServerWebExchange.from(MockServerHttpRequest
                .get("/api/chits")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + orgBToken));
        factory.apply(new JwtAuthGatewayFilter.Config()).filter(orgBExchange, chain).block();
        assertThat(orgBExchange.getResponse().getStatusCode()).isNull();
        verify(chain).filter(any());
    }

    @Test
    void expiryPermitsOnlyDedicatedSavedWorkRoutesWhileOrdinaryPaymentsStayBlocked() {
        String token = tenantToken("admin-1", "ADMIN", "tenant-1");
        when(tenantEntitlementClient.getEffectiveEntitlement("tenant-1")).thenReturn(Mono.just(
                new TenantEntitlementClient.TenantEntitlement("ACTIVE", LocalDateTime.now().minusDays(1).toString())));
        String id = "10000000-0000-0000-0000-000000000001";
        for (String path : java.util.List.of("/api/users/me/offline-access", "/api/payments/offline/record",
                "/api/payments/offline/staff-actions", "/api/payments/offline/reviews/legacy", "/api/payments/offline/reviews/recover", "/api/payments/offline/reviews/recover-legacy", "/api/payments/offline/reviews/cancel-unsynced",
                "/api/payments/offline/staff-actions/reviews/legacy", "/api/payments/offline/staff-actions/reviews/recover",
                "/api/payments/offline/staff-actions/reviews/recover-legacy", "/api/payments/offline/staff-actions/reviews/" + id + "/resolve",
                "/api/payments/offline/reviews/" + id + "/resolve", "/api/payments/offline/reviews/" + id + "/refund",
                "/api/payments/offline/reviews/" + id + "/cancel", "/api/payments/requests/" + id + "/collect")) {
            var chain = mock(GatewayFilterChain.class); when(chain.filter(any())).thenReturn(Mono.empty());
            var exchange = MockServerWebExchange.from(MockServerHttpRequest.post(path).header(HttpHeaders.AUTHORIZATION, "Bearer " + token));
            factory.apply(new JwtAuthGatewayFilter.Config()).filter(exchange, chain).block(); verify(chain).filter(any());
        }
        var ordinary = mock(GatewayFilterChain.class);
        var exchange = MockServerWebExchange.from(MockServerHttpRequest.post("/api/payments").header(HttpHeaders.AUTHORIZATION, "Bearer " + token));
        factory.apply(new JwtAuthGatewayFilter.Config()).filter(exchange, ordinary).block();
        assertThat(exchange.getResponse().getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN); verify(ordinary, never()).filter(any());
    }
    @Test
    void savedWorkStillFailsClosedForSuspendedOrganisations() {
        String token = tenantToken("admin-1", "ADMIN", "tenant-1");
        when(tenantEntitlementClient.getEffectiveEntitlement("tenant-1")).thenReturn(Mono.just(
                new TenantEntitlementClient.TenantEntitlement("SUSPENDED", LocalDateTime.now().minusDays(1).toString())));
        var chain = mock(GatewayFilterChain.class);
        var exchange = MockServerWebExchange.from(MockServerHttpRequest.post("/api/payments/offline/record").header(HttpHeaders.AUTHORIZATION, "Bearer " + token));
        factory.apply(new JwtAuthGatewayFilter.Config()).filter(exchange, chain).block();
        assertThat(exchange.getResponse().getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN); verify(chain, never()).filter(any());
    }

    private String memberToken(String subject, String tenantId) {
        return Jwts.builder()
                .subject(subject)
                .claim("role", "MEMBER")
                .claim("tenantId", tenantId)
                .issuedAt(new Date())
                .expiration(new Date(System.currentTimeMillis() + 60_000))
                .signWith(Keys.hmacShaKeyFor(SECRET.getBytes(StandardCharsets.UTF_8)))
                .compact();
    }

    private String token(String subject, String role, String scope) {
        var builder = Jwts.builder()
                .subject(subject)
                .claim("role", role)
                .issuedAt(new Date())
                .expiration(new Date(System.currentTimeMillis() + 60_000));
        if (scope != null) {
            builder.claim("scope", scope);
        }
        if ("HUB_SUPER_ADMIN".equals(scope)) {
            builder.claim("hubEmployeeId", "EMP-001");
            builder.claim("authVersion", 7L);
        }
        return builder.signWith(Keys.hmacShaKeyFor(SECRET.getBytes(StandardCharsets.UTF_8))).compact();
    }

    private String tenantToken(String subject, String role, String tenantId) {
        return Jwts.builder()
                .subject(subject)
                .claim("role", role)
                .claim("tenantId", tenantId)
                .issuedAt(new Date())
                .expiration(new Date(System.currentTimeMillis() + 60_000))
                .signWith(Keys.hmacShaKeyFor(SECRET.getBytes(StandardCharsets.UTF_8)))
                .compact();
    }
}
