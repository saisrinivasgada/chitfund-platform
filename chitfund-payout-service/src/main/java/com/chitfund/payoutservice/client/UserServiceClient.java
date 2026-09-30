package com.chitfund.payoutservice.client;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

import java.util.Map;

/** Reads the authoritative, current subscription state from user-service. */
@Component
@RequiredArgsConstructor
@Slf4j
public class UserServiceClient {

    private final RestTemplate restTemplate;

    @Value("${app.user-service-url:http://localhost:8081}")
    private String userServiceUrl;

    @Value("${app.internal-key:chitfund-internal-service-key}")
    private String internalKey;

    @SuppressWarnings("unchecked")
    public Map<String, Object> getEffectiveLimits(String tenantId) {
        try {
            HttpHeaders headers = new HttpHeaders();
            headers.set("X-Internal-Key", internalKey);
            ResponseEntity<Map> response = restTemplate.exchange(
                    userServiceUrl + "/internal/tenants/" + tenantId + "/effective-limits",
                    HttpMethod.GET,
                    new HttpEntity<>(headers),
                    Map.class);
            if (response.getStatusCode().is2xxSuccessful() && response.getBody() != null) {
                return response.getBody();
            }
        } catch (RestClientException e) {
            log.warn("Could not fetch effective limits for tenant {}: {}", tenantId, e.getMessage());
        }
        return null;
    }
}
