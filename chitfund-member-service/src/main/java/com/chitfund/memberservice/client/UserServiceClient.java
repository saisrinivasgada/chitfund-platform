package com.chitfund.memberservice.client;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

import java.util.HashMap;
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

    /**
     * Calls user-service /internal/users/link-or-create.
     * Returns { userId, setupToken?, isNew } or null if the call fails (non-fatal).
     */
    @SuppressWarnings("unchecked")
    public Map<String, String> linkOrCreate(String tenantId, UUID memberId, String phone,
                                             String phoneCountryCode, String fullName, String email) {
        try {
            Map<String, String> body = new HashMap<>();
            body.put("tenantId", tenantId);
            body.put("memberId", memberId.toString());
            body.put("phone", phone);
            body.put("phoneCountryCode", phoneCountryCode != null ? phoneCountryCode : "+91");
            if (fullName != null) body.put("fullName", fullName);
            if (email != null)    body.put("email", email);

            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            headers.set("X-Internal-Key", internalKey);

            return restTemplate.postForObject(
                    userServiceUrl + "/internal/users/link-or-create",
                    new HttpEntity<>(body, headers),
                    Map.class);
        } catch (RestClientException e) {
            log.warn("link-or-create call failed for member {}: {}", memberId, e.getMessage());
            return null;
        }
    }

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
}
