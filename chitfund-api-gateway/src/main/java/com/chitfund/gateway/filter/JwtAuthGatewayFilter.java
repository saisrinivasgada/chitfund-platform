package com.chitfund.gateway.filter;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.cloud.gateway.filter.GatewayFilter;
import org.springframework.cloud.gateway.filter.factory.AbstractGatewayFilterFactory;
import org.springframework.core.io.buffer.DataBuffer;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.http.server.reactive.ServerHttpResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.Map;

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

    private final ObjectMapper objectMapper = new ObjectMapper();

    public JwtAuthGatewayFilter() {
        super(Config.class);
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

                // Forward user identity headers to downstream services
                String tenantId = claims.get("tenantId", String.class);
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
                            headers.set("X-User-Id", claims.getSubject());
                            headers.set("X-User-Role", claims.get("role", String.class));
                            headers.set("X-Internal-Auth", internalServiceKey);
                            if (tenantId != null) headers.set("X-Tenant-Id", tenantId);
                            if (username != null) headers.set("X-User-Name", username);
                        });
                ServerHttpRequest mutatedRequest = reqBuilder.build();

                return chain.filter(exchange.mutate().request(mutatedRequest).build());

            } catch (JwtException e) {
                return unauthorized(exchange, "Invalid or expired token");
            }
        };
    }

    private Mono<Void> unauthorized(ServerWebExchange exchange, String message) {
        ServerHttpResponse response = exchange.getResponse();
        response.setStatusCode(HttpStatus.UNAUTHORIZED);
        response.getHeaders().setContentType(MediaType.APPLICATION_JSON);
        try {
            byte[] bytes = objectMapper.writeValueAsBytes(
                    Map.of("success", false, "errorCode", "AUTH_001", "message", message));
            DataBuffer buffer = response.bufferFactory().wrap(bytes);
            return response.writeWith(Mono.just(buffer));
        } catch (JsonProcessingException ex) {
            return response.setComplete();
        }
    }

    public static class Config {}
}
