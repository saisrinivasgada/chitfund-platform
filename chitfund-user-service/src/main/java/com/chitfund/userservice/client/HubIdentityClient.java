package com.chitfund.userservice.client;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

import java.util.Optional;

@Component
@Slf4j
public class HubIdentityClient {

    private final RestTemplate restTemplate;

    @Value("${app.management-service-url:http://localhost:8091}")
    private String managementServiceUrl;

    @Value("${app.internal-key}")
    private String internalKey;

    public HubIdentityClient(RestTemplate restTemplate) {
        this.restTemplate = restTemplate;
    }

    public Optional<HubAuthState> getAuthState(String employeeId) {
        try {
            HttpHeaders headers = new HttpHeaders();
            headers.set("X-Internal-Auth", internalKey);
            var response = restTemplate.exchange(
                    managementServiceUrl + "/internal/hub/employees/" + employeeId + "/auth-state",
                    HttpMethod.GET,
                    new HttpEntity<>(headers),
                    HubAuthState.class);
            return Optional.ofNullable(response.getBody());
        } catch (RestClientException ex) {
            log.warn("Unable to validate Hub identity employeeId=[{}]: {}", employeeId, ex.getMessage());
            return Optional.empty();
        }
    }

    public record HubAuthState(
            String id,
            String username,
            String fullName,
            String email,
            String role,
            boolean active,
            boolean mustChangePassword,
            long authVersion
    ) {}
}
