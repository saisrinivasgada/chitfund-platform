package com.chitfund.paymentservice.client;

import com.chitfund.common.exception.BusinessException;
import com.chitfund.common.exception.ErrorCode;
import com.chitfund.common.offline.OfflineReconciliationRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.client.HttpClientErrorException;

import java.util.ArrayList;
import java.util.List;
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

    /** Current permission and original recording authority, without requiring renewal. */
    @SuppressWarnings("unchecked")
    public String verifyOfflineRecordedAction(OfflineReconciliationRequest request) {
        return verifyOfflineEvidence(request, "/verify-recorded-action");
    }
    public void verifyOfflineReviewer(OfflineReconciliationRequest request) {
        verifyOfflineEvidence(request, "/verify-reviewer");
    }
    public String verifyOfflineHistoricalEvidence(OfflineReconciliationRequest request) {
        return verifyOfflineEvidence(request, "/verify-historical-evidence");
    }
    @SuppressWarnings("unchecked")
    private String verifyOfflineEvidence(OfflineReconciliationRequest request, String endpoint) {
        HttpHeaders headers = new HttpHeaders();
        headers.set("X-Internal-Key", internalKey);
        try {
            ResponseEntity<Map> response = restTemplate.exchange(
                    userServiceUrl + "/internal/offline-access" + endpoint,
                    HttpMethod.POST, new HttpEntity<>(request, headers), Map.class);
            if (response.getStatusCode().is2xxSuccessful() && response.getBody() != null
                    && response.getBody().get("grantId") instanceof String id && !id.isBlank()) {
                return id;
            }
        } catch (HttpClientErrorException rejected) {
            if (rejected.getStatusCode().value() == 403) {
                throw new BusinessException(ErrorCode.FORBIDDEN,
                        "Saved payment needs access restored or authorisation reviewed. It remains on the device.",
                        HttpStatus.FORBIDDEN);
            }
            // Internal authentication/contract errors are infrastructure failures,
            // not evidence that the user's saved payment should be rejected.
        } catch (RestClientException unavailable) {
            // Do not log the request: it contains historical authorisation evidence.
        }
        throw new BusinessException(ErrorCode.INTERNAL_SERVER_ERROR,
                "Saved payment access could not be verified. Sync will retry.", HttpStatus.SERVICE_UNAVAILABLE);
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

    /**
     * Returns the add-on keys enabled for the given tenant.
     * Returns null when user-service is unreachable. Authorization callers must
     * treat null as unverified and deny the operation.
     */
    @SuppressWarnings("unchecked")
    public List<String> getTenantAddOns(String tenantId) {
        if (tenantId == null || tenantId.isBlank()) return null;
        try {
            HttpHeaders headers = new HttpHeaders();
            headers.set("X-Internal-Key", internalKey);
            ResponseEntity<List> resp = restTemplate.exchange(
                    userServiceUrl + "/internal/add-ons/tenants/" + tenantId,
                    HttpMethod.GET,
                    new HttpEntity<>(headers),
                    List.class);
            if (resp.getStatusCode().is2xxSuccessful() && resp.getBody() != null) {
                return new ArrayList<>(resp.getBody());
            }
        } catch (RestClientException e) {
            log.warn("Could not fetch add-ons for tenant {}: {}", tenantId, e.getMessage());
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

    /**
     * The tenant a user belongs to, for refusing cross-org actions.
     *
     * <p>Returns empty when the user is unknown or user-service is unreachable.
     * Unlike {@link #getUserName}, callers must fail closed on an empty result —
     * falling open here would defeat the check.
     */
    @SuppressWarnings("unchecked")
    public String getUserTenantId(UUID userId) {
        if (userId == null) return "";
        try {
            HttpHeaders headers = new HttpHeaders();
            headers.set("X-Internal-Key", internalKey);

            ResponseEntity<Map> response = restTemplate.exchange(
                    userServiceUrl + "/internal/users/" + userId + "/tenant",
                    HttpMethod.GET,
                    new HttpEntity<>(headers),
                    Map.class);

            Map<String, Object> body = response.getBody();
            return body != null && body.get("tenantId") != null ? (String) body.get("tenantId") : "";

        } catch (RestClientException e) {
            log.warn("user-service unreachable for tenant lookup userId={}: {}", userId, e.getMessage());
            return "";
        }
    }
}
