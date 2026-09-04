package com.chitfund.gateway.filter;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
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
 * Per-client-IP limits (60-second window):
 *   Auth endpoints    /api/auth/**             →  15 req/min  (returns 401 to hide throttling)
 *   Hub login         /api/hub/auth/login      →  10 req/min  (returns 401 to hide throttling)
 *   Message sends     POST /api/conversations/ →  60 req/min
 *                     POST /api/groups/        →  60 req/min
 *   Everything else                            → 200 req/min
 *
 * NOTE: This is per-JVM. When scaling to multiple gateway nodes, replace with
 * Spring Cloud Gateway's built-in RequestRateLimiter backed by Redis.
 *
 * OPTIONS (CORS preflight) requests are always passed through.
 * X-Forwarded-For is respected so requests behind Nginx get the real client IP.
 */
@Component
@Slf4j
public class RateLimitGlobalFilter implements GlobalFilter, Ordered {

    // Disabled by default — set RATE_LIMIT_ENABLED=true in production only
    @Value("${app.rate-limit.enabled:false}")
    private boolean rateLimitEnabled;

    private static final long WINDOW_MS         = 60_000L;
    private static final int  AUTH_LIMIT        = 15;
    private static final int  HUB_LOGIN_LIMIT   = 10;
    private static final int  MESSAGE_LIMIT     = 60;
    private static final int  GLOBAL_LIMIT      = 200;

    private final ConcurrentHashMap<String, Deque<Long>> windows = new ConcurrentHashMap<>();
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Override
    public int getOrder() {
        return Ordered.HIGHEST_PRECEDENCE;
    }

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        ServerHttpRequest req = exchange.getRequest();

        if (!rateLimitEnabled || req.getMethod() == HttpMethod.OPTIONS) {
            return chain.filter(exchange);
        }

        String ip   = resolveClientIp(req);
        String path = req.getURI().getPath();
        HttpMethod method = req.getMethod();

        RateLimit limit = resolveLimit(path, method);

        if (!isAllowed(ip + ":" + limit.key, limit.limit)) {
            log.warn("Rate limit exceeded: ip={} path={} method={}", ip, path, method);
            return rateLimitResponse(exchange, limit.disguiseAs401);
        }
        return chain.filter(exchange);
    }

    private RateLimit resolveLimit(String path, HttpMethod method) {
        if (path.startsWith("/api/auth/")) {
            return new RateLimit("auth", AUTH_LIMIT, true);
        }
        if (path.equals("/api/hub/auth/login") || path.equals("/api/hub/auth/accept-invite")) {
            return new RateLimit("hub-auth", HUB_LOGIN_LIMIT, true);
        }
        if (HttpMethod.POST.equals(method)) {
            if (path.matches("/api/conversations/[^/]+/messages")) {
                return new RateLimit("conv-msg", MESSAGE_LIMIT, false);
            }
            if (path.matches("/api/groups/[^/]+/messages")) {
                return new RateLimit("group-msg", MESSAGE_LIMIT, false);
            }
        }
        return new RateLimit("global", GLOBAL_LIMIT, false);
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

    private Mono<Void> rateLimitResponse(ServerWebExchange exchange, boolean disguiseAs401) {
        ServerHttpResponse resp = exchange.getResponse();
        resp.getHeaders().setContentType(MediaType.APPLICATION_JSON);
        try {
            byte[] body;
            if (disguiseAs401) {
                // Don't reveal that throttling is happening — looks like a normal auth failure
                resp.setStatusCode(HttpStatus.UNAUTHORIZED);
                body = objectMapper.writeValueAsBytes(Map.of(
                        "success",   false,
                        "errorCode", "AUTH_001",
                        "message",   "Invalid username or password"
                ));
            } else {
                resp.setStatusCode(HttpStatus.TOO_MANY_REQUESTS);
                resp.getHeaders().set("Retry-After", "60");
                body = objectMapper.writeValueAsBytes(Map.of(
                        "success",   false,
                        "errorCode", "RATE_001",
                        "message",   "Too many requests. Please slow down and try again in a moment."
                ));
            }
            DataBuffer buf = resp.bufferFactory().wrap(body);
            return resp.writeWith(Mono.just(buf));
        } catch (JsonProcessingException ex) {
            return resp.setComplete();
        }
    }

    private record RateLimit(String key, int limit, boolean disguiseAs401) {}
}
