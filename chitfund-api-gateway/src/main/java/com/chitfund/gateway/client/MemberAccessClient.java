package com.chitfund.gateway.client;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatusCode;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;

import java.time.Duration;

/** Asks user-service whether a member's link to a tenant is still active. */
@Component
public class MemberAccessClient {

    private final WebClient webClient;
    private final String internalServiceKey;

    public MemberAccessClient(
            WebClient.Builder builder,
            @Value("${chitwise.user-service-url}") String userServiceUrl,
            @Value("${internal.service.key}") String internalServiceKey) {
        this.webClient = builder.baseUrl(userServiceUrl).build();
        this.internalServiceKey = internalServiceKey;
    }

    /**
     * Returns true when the userId+tenantId member link exists (member active).
     * Returns false when the link is absent (suspended or revoked).
     * Emits an error on connectivity problems — callers must fail-closed.
     */
    public Mono<Boolean> isMemberActive(String userId, String tenantId) {
        return webClient.get()
                .uri(ub -> ub.path("/internal/users/member-link/check")
                        .queryParam("userId", userId)
                        .queryParam("tenantId", tenantId)
                        .build())
                .header("X-Internal-Key", internalServiceKey)
                .retrieve()
                .onStatus(HttpStatusCode::isError,
                        response -> Mono.error(new IllegalStateException(
                                "Member access authority rejected the validation request")))
                .bodyToMono(MemberLinkStatus.class)
                .map(MemberLinkStatus::active)
                .timeout(Duration.ofSeconds(2));
    }

    public record MemberLinkStatus(boolean active) { }
}
