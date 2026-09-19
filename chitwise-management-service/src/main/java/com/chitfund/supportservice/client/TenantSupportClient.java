package com.chitfund.supportservice.client;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpHeaders;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

@Component
@Slf4j
public class TenantSupportClient {
    private final RestClient restClient;
    private final String internalKey;

    public TenantSupportClient(RestClient.Builder builder,
                               @Value("${app.user-service-url:http://localhost:8081}") String baseUrl,
                               @Value("${app.internal-key}") String internalKey) {
        this.restClient = builder.baseUrl(baseUrl).build();
        this.internalKey = internalKey;
    }

    public SupportContext getSupportContext(String tenantId) {
        try {
            SupportContext response = restClient.get()
                    .uri("/internal/tenants/{tenantId}/support-context", tenantId)
                    .header("X-Internal-Key", internalKey)
                    .retrieve()
                    .body(SupportContext.class);
            return response != null ? response : SupportContext.fallback();
        } catch (RestClientException ex) {
            // Priority is an entitlement: fail closed instead of accidentally
            // promising priority service when the plan cannot be verified.
            log.warn("Unable to resolve support entitlement for tenantId=[{}]: {}", tenantId, ex.getMessage());
            return SupportContext.fallback();
        }
    }

    public List<TenantSummary> listActiveTenants(String query) {
        try {
            String uri = query != null && !query.isBlank()
                    ? "/internal/tenants?q=" + java.net.URLEncoder.encode(query.trim(), java.nio.charset.StandardCharsets.UTF_8)
                    : "/internal/tenants";
            List<TenantSummary> result = restClient.get()
                    .uri(uri)
                    .header("X-Internal-Key", internalKey)
                    .retrieve()
                    .body(new ParameterizedTypeReference<>() {});
            return result != null ? result : Collections.emptyList();
        } catch (RestClientException ex) {
            log.warn("Unable to list tenants: {}", ex.getMessage());
            return Collections.emptyList();
        }
    }

    /**
     * Returns enabled capability keys for the tenant.
     * Returns null when user-service is unreachable so callers can fail open.
     */
    @SuppressWarnings("unchecked")
    public List<String> getCapabilities(String tenantId) {
        if (tenantId == null || tenantId.isBlank()) return null;
        try {
            List<String> result = restClient.get()
                    .uri("/internal/capabilities/tenants/{tenantId}", tenantId)
                    .header("X-Internal-Key", internalKey)
                    .retrieve()
                    .body(List.class);
            return result != null ? new ArrayList<>(result) : null;
        } catch (RestClientException ex) {
            log.warn("Could not fetch capabilities for tenant [{}]: {}", tenantId, ex.getMessage());
            return null;
        }
    }

    public record SupportContext(String tenantName, boolean prioritySupport) {
        public static SupportContext fallback() { return new SupportContext(null, false); }
    }

    public record TenantSummary(String id, String name, String status) {}
}

