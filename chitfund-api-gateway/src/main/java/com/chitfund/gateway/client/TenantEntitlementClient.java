package com.chitfund.gateway.client;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatusCode;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;

import java.time.Duration;

/** Reads the authoritative tenant status used to gate mutating API requests. */
@Component
public class TenantEntitlementClient {

    private final WebClient webClient;
    private final String internalServiceKey;

    public TenantEntitlementClient(
            WebClient.Builder builder,
            @Value("${chitwise.user-service-url}") String userServiceUrl,
            @Value("${internal.service.key}") String internalServiceKey) {
        this.webClient = builder.baseUrl(userServiceUrl).build();
        this.internalServiceKey = internalServiceKey;
    }

    public Mono<TenantEntitlement> getEffectiveEntitlement(String tenantId) {
        return webClient.get()
                .uri("/internal/tenants/{tenantId}/effective-limits", tenantId)
                .header("X-Internal-Key", internalServiceKey)
                .retrieve()
                .onStatus(HttpStatusCode::isError,
                        response -> Mono.error(new IllegalStateException(
                                "Tenant entitlement authority rejected the validation request")))
                .bodyToMono(TenantEntitlement.class)
                .timeout(Duration.ofSeconds(2));
    }

    public record TenantEntitlement(String tenantStatus, String planExpiresAt) { }
}
