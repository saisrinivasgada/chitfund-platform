package com.chitfund.reportingservice.client;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestTemplate;

import java.util.List;

/**
 * Calls user-service internal API to check what add-ons a tenant's plan grants.
 *
 * Fail-closed: if user-service is unreachable, returns false (deny access).
 * This prevents add-on checks from being bypassed during an outage.
 */
@Component
@Slf4j
public class PlanAddOnClient {

    private final RestTemplate restTemplate;
    private final String userServiceUrl;
    private final String internalKey;

    public PlanAddOnClient(
            RestTemplate restTemplate,
            @Value("${user-service.url:http://user-service:8081}") String userServiceUrl,
            @Value("${reporting.internal-key:chitfund-internal-service-key}") String internalKey) {
        this.restTemplate = restTemplate;
        this.userServiceUrl = userServiceUrl;
        this.internalKey = internalKey;
    }

    /**
     * Returns true if the tenant's plan has the given add-on key enabled.
     * Example add-on keys: "full_analytics", "digital_payments"
     */
    public boolean hasAddOn(String tenantId, String addOnKey) {
        if (tenantId == null || tenantId.isBlank()) return false;
        try {
            HttpHeaders headers = new HttpHeaders();
            headers.set("X-Internal-Key", internalKey);

            ResponseEntity<List<String>> response = restTemplate.exchange(
                    userServiceUrl + "/internal/add-ons/tenants/" + tenantId,
                    HttpMethod.GET,
                    new HttpEntity<>(headers),
                    new ParameterizedTypeReference<List<String>>() {}
            );

            List<String> addOns = response.getBody();
            return addOns != null && addOns.contains(addOnKey);
        } catch (Exception e) {
            log.warn("Could not verify plan add-on '{}' for tenant {}: {}",
                    addOnKey, tenantId, e.getMessage());
            return false;
        }
    }
}
