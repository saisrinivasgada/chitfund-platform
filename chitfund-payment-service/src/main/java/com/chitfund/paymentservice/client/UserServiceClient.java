package com.chitfund.paymentservice.client;

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
import java.util.UUID;

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
            ResponseEntity<Map> resp = restTemplate.exchange(
                    userServiceUrl + "/internal/tenants/" + tenantId + "/effective-limits",
                    HttpMethod.GET,
                    new HttpEntity<>(headers),
                    Map.class);
            if (resp.getStatusCode().is2xxSuccessful() && resp.getBody() != null) {
                return resp.getBody();
            }
        } catch (RestClientException e) {
            log.warn("Could not fetch effective limits for tenant {}: {}", tenantId, e.getMessage());
        }
        return null;
    }

    /**
     * Returns a user's full name (worker/admin) for notification messages.
     * Returns empty string on any error — callers fall back to generic phrases.
     */
    @SuppressWarnings("unchecked")
    public String getUserName(UUID userId) {
        if (userId == null) return "";
        try {
            HttpHeaders headers = new HttpHeaders();
            headers.set("X-Internal-Key", internalKey);

            ResponseEntity<Map> response = restTemplate.exchange(
                    userServiceUrl + "/internal/users/" + userId + "/name",
                    HttpMethod.GET,
                    new HttpEntity<>(headers),
                    Map.class);

            Map<String, Object> body = response.getBody();
            return body != null && body.get("name") != null ? (String) body.get("name") : "";

        } catch (RestClientException e) {
            log.warn("user-service unreachable for name lookup userId={}: {}", userId, e.getMessage());
            return "";
        }
    }
}
