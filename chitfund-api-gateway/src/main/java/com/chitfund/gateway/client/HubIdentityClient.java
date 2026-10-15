package com.chitfund.gateway.client;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatusCode;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;

import java.time.Duration;

/** Revalidates privileged Hub identities against their authoritative service. */
@Component
public class HubIdentityClient {

    private final WebClient webClient;
    private final String internalServiceKey;

    public HubIdentityClient(
            WebClient.Builder builder,
            @Value("${chitwise.management-service-url}") String managementServiceUrl,
            @Value("${internal.service.key}") String internalServiceKey) {
        this.webClient = builder.baseUrl(managementServiceUrl).build();
        this.internalServiceKey = internalServiceKey;
    }

    public Mono<HubAuthState> getAuthState(String employeeId) {
        return webClient.get()
                .uri("/internal/hub/employees/{id}/auth-state", employeeId)
                .header("X-Internal-Auth", internalServiceKey)
                .retrieve()
                .onStatus(HttpStatusCode::isError,
                        response -> Mono.error(new IllegalStateException(
                                "Hub identity authority rejected the validation request")))
                .bodyToMono(HubAuthState.class)
                .timeout(Duration.ofSeconds(2));
    }

    public record HubAuthState(
            String id,
            String role,
            boolean active,
            boolean mustChangePassword,
            long authVersion,
            boolean platformConsoleAccess
    ) { }
}
