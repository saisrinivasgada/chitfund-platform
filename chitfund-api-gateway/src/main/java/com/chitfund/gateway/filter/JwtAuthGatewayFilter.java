package com.chitfund.gateway.filter;

import com.chitfund.gateway.client.HubIdentityClient;
import com.chitfund.gateway.client.MemberAccessClient;
import com.chitfund.gateway.client.TenantEntitlementClient;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.cloud.gateway.filter.GatewayFilter;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.factory.AbstractGatewayFilterFactory;
import org.springframework.core.io.buffer.DataBuffer;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.http.server.reactive.ServerHttpResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.time.format.DateTimeParseException;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * WHY validate JWT at the gateway?
 * - Single enforcement point — downstream services TRUST the gateway.
 * - Services still re-validate for defence-in-depth, but the gateway catches
 *   invalid/expired tokens before they consume any service threads.
 * - INTERVIEW: "The gateway is the perimeter. Services inside the perimeter
 *   can assume the caller is authenticated. This is the zero-trust lite model."
 */
@Component
public class JwtAuthGatewayFilter extends AbstractGatewayFilterFactory<JwtAuthGatewayFilter.Config> {

    @Value("${jwt.secret}")
    private String jwtSecret;

    @Value("${internal.service.key}")
    private String internalServiceKey;

    private final HubIdentityClient hubIdentityClient;
    private final TenantEntitlementClient tenantEntitlementClient;
    private final MemberAccessClient memberAccessClient;
    private final ObjectMapper objectMapper = new ObjectMapper();

    private static final Set<String> ACCOUNT_WRITE_PATHS = Set.of(
            "/api/users/me/change-password",
            "/api/users/me/profile",
            "/api/users/me/phone/send-otp",
            "/api/users/me/phone/verify-otp",
            "/api/users/me/support-number/send-otp",
            "/api/users/me/support-number/verify"
    );

    public JwtAuthGatewayFilter(HubIdentityClient hubIdentityClient,
                                TenantEntitlementClient tenantEntitlementClient,
                                MemberAccessClient memberAccessClient) {
        super(Config.class);
        this.hubIdentityClient = hubIdentityClient;
        this.tenantEntitlementClient = tenantEntitlementClient;
        this.memberAccessClient = memberAccessClient;
    }

    @Override
    public GatewayFilter apply(Config config) {
        return (exchange, chain) -> {
            String authHeader = exchange.getRequest().getHeaders().getFirst(HttpHeaders.AUTHORIZATION);

            if (authHeader == null || !authHeader.startsWith("Bearer ")) {
                return unauthorized(exchange, "Missing or invalid Authorization header");
            }

            String token = authHeader.substring(7);
            try {
                SecretKey key = Keys.hmacShaKeyFor(
                        jwtSecret.getBytes(StandardCharsets.UTF_8));
                Claims claims = Jwts.parser()
                        .verifyWith(key)
                        .build()
                        .parseSignedClaims(token)
                        .getPayload();

                String scope = claims.get("scope", String.class);
                if ("TENANT_SELECT".equals(scope) || "LOGIN_OTP_PENDING".equals(scope)) {
                    return unauthorized(exchange, "Token scope not allowed for this endpoint");
                }

                // SUPER_ADMIN is an employee identity owned by management-service.
                // Never accept a legacy users-table token, even if it is still
                // cryptographically valid or a stale local database recreates the row.
                String role = claims.get("role", String.class);
                if ("SUPER_ADMIN".equals(role) && !"HUB_SUPER_ADMIN".equals(scope)) {
                    return unauthorized(exchange, "Super Admins must sign in through the ChitWise Hub");
                }

                if ("HUB_SUPER_ADMIN".equals(scope)) {
                    String employeeId = claims.get("hubEmployeeId", String.class);
                    Number tokenVersion = claims.get("authVersion", Number.class);
                    if (employeeId == null || employeeId.isBlank() || tokenVersion == null) {
                        return unauthorized(exchange, "Invalid privileged session");
                    }
                    return hubIdentityClient.getAuthState(employeeId)
                            // The authority service is part of privileged authentication.
                            // An outage must fail closed rather than extend a stale session.
                            .map(state -> state.active()
                                    && !state.mustChangePassword()
                                    && ("SUPER_ADMIN".equals(state.role())
                                            || state.platformConsoleAccess())
                                    && state.authVersion() == tokenVersion.longValue())
                            .onErrorReturn(false)
                            .defaultIfEmpty(false)
                            .flatMap(current -> current
                                    ? forward(exchange, chain, claims, role)
                                    : unauthorized(exchange,
                                            "Privileged session is no longer valid"));
                }

                return forward(exchange, chain, claims, role);

            } catch (JwtException | IllegalArgumentException e) {
                return unauthorized(exchange, "Invalid or expired token");
            }
        };
    }

    private Mono<Void> forward(ServerWebExchange exchange, GatewayFilterChain chain,
                               Claims claims, String role) {
        String tenantId = claims.get("tenantId", String.class);
        String userId = claims.getSubject();

        if ("MEMBER".equals(role) && tenantId != null && !tenantId.isBlank()) {
            return memberAccessClient.isMemberActive(userId, tenantId)
                    .flatMap(active -> active
                            ? forwardWithEntitlement(exchange, chain, claims, role, tenantId)
                            : unauthorized(exchange, "Member access has been revoked for this organization"))
                    .onErrorResume(ex -> error(exchange, HttpStatus.SERVICE_UNAVAILABLE,
                            "MEMBER_ACCESS_UNAVAILABLE",
                            "Member access could not be verified. Please try again."));
        }
        return forwardWithEntitlement(exchange, chain, claims, role, tenantId);
    }

    private Mono<Void> forwardWithEntitlement(ServerWebExchange exchange, GatewayFilterChain chain,
                                              Claims claims, String role, String tenantId) {
        if (requiresLiveEntitlement(exchange, tenantId, role)) {
            return tenantEntitlementClient.getEffectiveEntitlement(tenantId)
                    .map(this::evaluateEntitlement)
                    .switchIfEmpty(Mono.just(EntitlementDecision.unavailable()))
                    .onErrorReturn(EntitlementDecision.unavailable())
                    .flatMap(decision -> decision.allowed()
                            ? forwardValidated(exchange, chain, claims, role, tenantId)
                            : error(exchange, decision.status(), decision.errorCode(), decision.message()));
        }
        return forwardValidated(exchange, chain, claims, role, tenantId);
    }

    private Mono<Void> forwardValidated(ServerWebExchange exchange, GatewayFilterChain chain,
                                        Claims claims, String role, String tenantId) {
        String username = claims.get("username", String.class);
        var reqBuilder = exchange.getRequest().mutate()
                .headers(headers -> {
                    // Never forward caller-supplied identity. Only claims from the
                    // validated JWT may populate these trusted internal headers.
                    headers.remove("X-User-Id");
                    headers.remove("X-User-Role");
                    headers.remove("X-Tenant-Id");
                    headers.remove("X-User-Name");
                    headers.remove("X-Internal-Auth");
                    // X-Internal-Key authenticates direct service-to-service calls.
                    // It must never be forwarded from an internet-facing request.
                    headers.remove("X-Internal-Key");
                    headers.set("X-User-Id", claims.getSubject());
                    headers.set("X-User-Role", role);
                    headers.set("X-Internal-Auth", internalServiceKey);
                    if (tenantId != null) headers.set("X-Tenant-Id", tenantId);
                    if (username != null) headers.set("X-User-Name", username);
                });
        ServerHttpRequest mutatedRequest = reqBuilder.build();
        return chain.filter(exchange.mutate().request(mutatedRequest).build());
    }

    private boolean requiresLiveEntitlement(ServerWebExchange exchange, String tenantId, String role) {
        HttpMethod method = exchange.getRequest().getMethod();
        if (tenantId == null || tenantId.isBlank() || "SUPER_ADMIN".equals(role)
                || method == null || Set.of(HttpMethod.GET, HttpMethod.HEAD, HttpMethod.OPTIONS).contains(method)) {
            return false;
        }
        String path = exchange.getRequest().getPath().value();
        if (path.equals("/api/plans/upgrade-request") || path.equals("/api/plans/renewal-request")
                || path.startsWith("/api/billing/")
                || path.equals("/api/tickets") || path.startsWith("/api/tickets/")
                || path.startsWith("/api/support/")) {
            return false;
        }
        if (ACCOUNT_WRITE_PATHS.contains(path)) return false;
        if (method == HttpMethod.PATCH && path.startsWith("/api/notifications/")) return false;
        return !(method == HttpMethod.PUT && path.matches("^/api/reminders/[^/]+/seen$"));
    }

    private EntitlementDecision evaluateEntitlement(
            TenantEntitlementClient.TenantEntitlement entitlement) {
        if (entitlement == null || entitlement.tenantStatus() == null
                || entitlement.tenantStatus().isBlank()) {
            return EntitlementDecision.unavailable();
        }
        String status = entitlement.tenantStatus().trim().toUpperCase(Locale.ROOT);
        if (!"ACTIVE".equals(status)) {
            return EntitlementDecision.denied("TENANT_INACTIVE",
                    "Organization is " + status.toLowerCase(Locale.ROOT)
                            + ". Operational changes are disabled; billing and support remain available.");
        }
        if (entitlement.planExpiresAt() != null && !entitlement.planExpiresAt().isBlank()) {
            try {
                if (LocalDateTime.parse(entitlement.planExpiresAt()).isBefore(LocalDateTime.now())) {
                    return EntitlementDecision.denied("PLAN_002",
                            "Your subscription has expired. Operational changes are disabled; renew to continue.");
                }
            } catch (DateTimeParseException invalidEntitlement) {
                return EntitlementDecision.unavailable();
            }
        }
        return EntitlementDecision.permitted();
    }

    private Mono<Void> unauthorized(ServerWebExchange exchange, String message) {
        return error(exchange, HttpStatus.UNAUTHORIZED, "AUTH_001", message);
    }

    private record EntitlementDecision(boolean allowed, HttpStatus status,
                                       String errorCode, String message) {
        private static EntitlementDecision permitted() {
            return new EntitlementDecision(true, null, null, null);
        }

        private static EntitlementDecision denied(String errorCode, String message) {
            return new EntitlementDecision(false, HttpStatus.FORBIDDEN, errorCode, message);
        }

        private static EntitlementDecision unavailable() {
            return new EntitlementDecision(false, HttpStatus.SERVICE_UNAVAILABLE,
                    "PLAN_VERIFICATION_UNAVAILABLE",
                    "Subscription could not be verified. Please try again.");
        }
    }

    private Mono<Void> error(ServerWebExchange exchange, HttpStatus status,
                             String errorCode, String message) {
        ServerHttpResponse response = exchange.getResponse();
        response.setStatusCode(status);
        response.getHeaders().setContentType(MediaType.APPLICATION_JSON);
        try {
            byte[] bytes = objectMapper.writeValueAsBytes(
                    Map.of("success", false, "errorCode", errorCode, "message", message));
            DataBuffer buffer = response.bufferFactory().wrap(bytes);
            return response.writeWith(Mono.just(buffer));
        } catch (JsonProcessingException ex) {
            return response.setComplete();
        }
    }

    public static class Config {}
}
