package com.chitfund.gateway.filter;

import org.junit.jupiter.api.Test;
import org.springframework.mock.http.server.reactive.MockServerHttpRequest;
import org.springframework.mock.web.server.MockServerWebExchange;
import reactor.core.publisher.Mono;

import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;

class RequestContextGlobalFilterTest {

    private final RequestContextGlobalFilter filter = new RequestContextGlobalFilter();

    @Test
    void replacesCallerCorrelationAndKeepsKnownClientSource() {
        var exchange = MockServerWebExchange.from(MockServerHttpRequest.get("/api/test")
                .header("X-Request-ID", "forged-request")
                .header("X-Client-Source", " mobile "));
        AtomicReference<String> requestId = new AtomicReference<>();
        AtomicReference<String> source = new AtomicReference<>();

        filter.filter(exchange, filtered -> {
            requestId.set(filtered.getRequest().getHeaders().getFirst("X-Request-ID"));
            source.set(filtered.getRequest().getHeaders().getFirst("X-Client-Source"));
            return Mono.empty();
        }).block();

        assertThat(requestId.get()).isNotBlank().isNotEqualTo("forged-request");
        assertThat(source.get()).isEqualTo("MOBILE");
        assertThat(exchange.getResponse().getHeaders().getFirst("X-Request-ID"))
                .isEqualTo(requestId.get());
    }

    @Test
    void rejectsArbitraryClientSourceMetadata() {
        var exchange = MockServerWebExchange.from(MockServerHttpRequest.get("/api/test")
                .header("X-Client-Source", "SYSTEM"));
        AtomicReference<String> source = new AtomicReference<>();

        filter.filter(exchange, filtered -> {
            source.set(filtered.getRequest().getHeaders().getFirst("X-Client-Source"));
            return Mono.empty();
        }).block();

        assertThat(source.get()).isEqualTo("UNKNOWN");
    }
}
