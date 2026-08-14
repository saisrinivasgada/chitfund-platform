package com.chitfund.gateway.filter;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.core.Ordered;
import org.springframework.core.io.buffer.DataBuffer;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.http.server.reactive.ServerHttpResponse;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Sliding-window rate limiter at the gateway.
 *
 * Limits are per client IP per 60-second window:
 *   - Auth endpoints  (/api/auth/**): 15 req/min — login, OTP send/verify
 *   - Everything else               : 200 req/min
 *
 * OPTIONS (CORS preflight) requests are always passed through.
 * X-Forwarded-For is respected so requests behind Nginx get the real client IP.
 */
@Component
@Slf4j
public class RateLimitGlobalFilter implements GlobalFilter, Ordered {

    private static final long WINDOW_MS   = 60_000L;
    private static final int  AUTH_LIMIT  = 15;
    private static final int  GLOBAL_LIMIT = 200;

    // key: "ip:auth" or "ip:api" → sliding window of request timestamps
    private final ConcurrentHashMap<String, Deque<Long>> windows = new ConcurrentHashMap<>();
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Override
    public int getOrder() {
        return Ordered.HIGHEST_PRECEDENCE;
    }

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        ServerHttpRequest req = exchange.getRequest();

        // Always pass CORS pre-flight
        if (req.getMethod() == HttpMethod.OPTIONS) {
            return chain.filter(exchange);
        }

        String ip    = resolveClientIp(req);
        String path  = req.getURI().getPath();
        boolean auth = path.startsWith("/api/auth/");
        int     limit = auth ? AUTH_LIMIT : GLOBAL_LIMIT;
        String  key   = ip + (auth ? ":auth" : ":api");

        if (!isAllowed(key, limit)) {
            log.warn("Rate limit exceeded: ip={} path={} auth={}", ip, path, auth);
            return tooManyRequests(exchange, auth);
        }
        return chain.filter(exchange);
    }

    private boolean isAllowed(String key, int limit) {
        long now         = System.currentTimeMillis();
        long windowStart = now - WINDOW_MS;
        int[] count = {0};

        windows.compute(key, (k, dq) -> {
            if (dq == null) dq = new ArrayDeque<>();
            while (!dq.isEmpty() && dq.peekFirst() < windowStart) dq.pollFirst();
            dq.addLast(now);
            count[0] = dq.size();
            return dq;
        });

        return count[0] <= limit;
    }

    /** Purge stale entries every 5 minutes to prevent unbounded map growth. */
    @Scheduled(fixedDelay = 300_000)
    public void cleanup() {
        long windowStart = System.currentTimeMillis() - WINDOW_MS;
        windows.entrySet().removeIf(e -> {
            Deque<Long> dq = e.getValue();
            return dq == null || dq.isEmpty() || dq.peekLast() < windowStart;
        });
    }

    private String resolveClientIp(ServerHttpRequest req) {
        String forwarded = req.getHeaders().getFirst("X-Forwarded-For");
        if (forwarded != null && !forwarded.isBlank()) {
            return forwarded.split(",")[0].trim();
        }
        var addr = req.getRemoteAddress();
        return addr != null ? addr.getAddress().getHostAddress() : "unknown";
    }

    private Mono<Void> tooManyRequests(ServerWebExchange exchange, boolean isAuth) {
        ServerHttpResponse resp = exchange.getResponse();
        if (isAuth) {
            // For auth endpoints, return 401 with a generic credential error — indistinguishable
            // from a real wrong-password response so attackers get no signal they're being limited.
            resp.setStatusCode(HttpStatus.UNAUTHORIZED);
            resp.getHeaders().setContentType(MediaType.APPLICATION_JSON);
            try {
                byte[] body = objectMapper.writeValueAsBytes(Map.of(
                        "success",   false,
                        "errorCode", "AUTH_001",
                        "message",   "Invalid username or password"
                ));
                DataBuffer buf = resp.bufferFactory().wrap(body);
                return resp.writeWith(Mono.just(buf));
            } catch (JsonProcessingException ex) {
                return resp.setComplete();
            }
        }
        // For non-auth endpoints it is fine to be honest about rate limiting.
        resp.setStatusCode(HttpStatus.TOO_MANY_REQUESTS);
        resp.getHeaders().setContentType(MediaType.APPLICATION_JSON);
        resp.getHeaders().set("Retry-After", "60");
        try {
            byte[] body = objectMapper.writeValueAsBytes(Map.of(
                    "success",   false,
                    "errorCode", "RATE_001",
                    "message",   "Too many requests. Please slow down and try again in a moment."
            ));
            DataBuffer buf = resp.bufferFactory().wrap(body);
            return resp.writeWith(Mono.just(buf));
        } catch (JsonProcessingException ex) {
            return resp.setComplete();
        }
    }
}
