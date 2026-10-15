package com.chitfund.gateway.filter;

import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.core.Ordered;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import java.util.Set;
import java.util.UUID;

/**
 * Creates one trusted correlation ID at the public boundary and carries a
 * normalized client channel to downstream services. Caller-supplied request
 * IDs are deliberately replaced so an external client cannot forge another
 * request's audit correlation.
 */
@Component
public class RequestContextGlobalFilter implements GlobalFilter, Ordered {

    static final String REQUEST_ID_HEADER = "X-Request-ID";
    static final String CLIENT_SOURCE_HEADER = "X-Client-Source";
    private static final Set<String> PUBLIC_SOURCES = Set.of("WEB", "MOBILE", "OFFLINE_SYNC");

    @Override
    public int getOrder() {
        return Ordered.HIGHEST_PRECEDENCE + 1;
    }

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        String requestId = UUID.randomUUID().toString();
        String source = normalizePublicSource(
                exchange.getRequest().getHeaders().getFirst(CLIENT_SOURCE_HEADER));

        ServerHttpRequest request = exchange.getRequest().mutate()
                .headers(headers -> {
                    headers.remove(REQUEST_ID_HEADER);
                    headers.remove(CLIENT_SOURCE_HEADER);
                    headers.set(REQUEST_ID_HEADER, requestId);
                    headers.set(CLIENT_SOURCE_HEADER, source);
                })
                .build();
        exchange.getResponse().getHeaders().set(REQUEST_ID_HEADER, requestId);
        return chain.filter(exchange.mutate().request(request).build());
    }

    private static String normalizePublicSource(String source) {
        String normalized = source == null ? null : source.trim().toUpperCase();
        return normalized != null && PUBLIC_SOURCES.contains(normalized) ? normalized : "UNKNOWN";
    }
}
