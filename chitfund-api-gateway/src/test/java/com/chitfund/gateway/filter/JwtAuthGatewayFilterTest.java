package com.chitfund.gateway.filter;

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
import java.util.Date;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class JwtAuthGatewayFilterTest {
    private static final String SECRET = "gateway-test-secret-at-least-thirty-two-characters";
    private JwtAuthGatewayFilter factory;

    @BeforeEach
    void setUp() {
        factory = new JwtAuthGatewayFilter();
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
        GatewayFilterChain chain = mock(GatewayFilterChain.class);
        when(chain.filter(any())).thenReturn(Mono.empty());
        var exchange = MockServerWebExchange.from(MockServerHttpRequest.get("/api/super-admin/tenants")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .header("X-User-Id", "attacker")
                .header("X-User-Role", "ADMIN")
                .header("X-Internal-Auth", "attacker-key"));

        factory.apply(new JwtAuthGatewayFilter.Config()).filter(exchange, chain).block();

        ArgumentCaptor<ServerWebExchange> forwarded = ArgumentCaptor.forClass(ServerWebExchange.class);
        verify(chain).filter(forwarded.capture());
        var headers = forwarded.getValue().getRequest().getHeaders();
        assertThat(headers.getFirst("X-User-Id")).isEqualTo("employee-1");
        assertThat(headers.getFirst("X-User-Role")).isEqualTo("SUPER_ADMIN");
        assertThat(headers.getFirst("X-Internal-Auth")).isEqualTo("trusted-internal-key");
    }

    private String token(String subject, String role, String scope) {
        var builder = Jwts.builder()
                .subject(subject)
                .claim("role", role)
                .issuedAt(new Date())
                .expiration(new Date(System.currentTimeMillis() + 60_000));
        if (scope != null) builder.claim("scope", scope);
        return builder.signWith(Keys.hmacShaKeyFor(SECRET.getBytes(StandardCharsets.UTF_8))).compact();
    }
}
