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
    public Map<String, Object> createAppAccessRequest(String tenantId, UUID memberId, String phone,
                                                       String phoneCountryCode, String email,
                                                       UUID requestedBy) {
        Map<String, String> body = new HashMap<>();
        body.put("tenantId", tenantId);
        body.put("memberId", memberId.toString());
        body.put("phone", phone);
        body.put("phoneCountryCode", phoneCountryCode != null ? phoneCountryCode : "+91");
        if (email != null && !email.isBlank()) body.put("email", email);
        if (requestedBy != null) body.put("requestedBy", requestedBy.toString());
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.set("X-Internal-Key", internalKey);
        ResponseEntity<Map> response = restTemplate.exchange(
                userServiceUrl + "/internal/users/app-access-requests", HttpMethod.POST,
                new HttpEntity<>(body, headers), Map.class);
        return response.getBody();
    }

    @SuppressWarnings("unchecked")
    public Map<String, Object> grantAppAccessSendOtp(String tenantId, UUID memberId,
                                                      String phone, String phoneCountryCode) {
        try {
            Map<String, String> body = new HashMap<>();
            body.put("tenantId", tenantId);
            body.put("memberId", memberId.toString());
            body.put("phone", phone);
            body.put("phoneCountryCode", phoneCountryCode != null ? phoneCountryCode : "+91");
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            headers.set("X-Internal-Key", internalKey);
            ResponseEntity<Map> response = restTemplate.exchange(
                    userServiceUrl + "/internal/users/grant-app-access/send-otp", HttpMethod.POST,
                    new HttpEntity<>(body, headers), Map.class);
            return response.getBody();
        } catch (org.springframework.web.client.HttpClientErrorException e) {
            String body = e.getResponseBodyAsString();
            log.warn("grant-app-access/send-otp failed for member {}: {}", memberId, body);
            // Surface rate-limit and other user-facing errors
            try {
                Map<?, ?> err = new com.fasterxml.jackson.databind.ObjectMapper().readValue(body, Map.class);
                String msg = err.get("error") != null ? String.valueOf(err.get("error")) : null;
                if (msg != null) throw new RuntimeException(msg);
            } catch (RuntimeException re) { throw re; }
            catch (Exception ignored) { }
            return null;
        } catch (RestClientException e) {
            log.warn("grant-app-access/send-otp failed for member {}: {}", memberId, e.getMessage());
            return null;
        }
    }

    @SuppressWarnings("unchecked")
    public java.util.UUID grantAppAccessVerify(String tenantId, UUID memberId,
                                      String phone, String phoneCountryCode, String otp) {
        Map<String, String> body = new HashMap<>();
        body.put("tenantId", tenantId);
        body.put("memberId", memberId.toString());
        body.put("phone", phone);
        body.put("phoneCountryCode", phoneCountryCode != null ? phoneCountryCode : "+91");
        body.put("otp", otp);
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.set("X-Internal-Key", internalKey);
        ResponseEntity<Map> response = restTemplate.exchange(
                userServiceUrl + "/internal/users/grant-app-access/verify", HttpMethod.POST,
                new HttpEntity<>(body, headers), Map.class);
        if (!response.getStatusCode().is2xxSuccessful()) {
            String errMsg = response.getBody() != null
                    ? String.valueOf(response.getBody().get("error")) : "OTP verification failed";
            throw new RuntimeException(errMsg);
        }
        String userIdStr = response.getBody() != null ? String.valueOf(response.getBody().get("userId")) : null;
        return userIdStr != null && !"null".equals(userIdStr) ? java.util.UUID.fromString(userIdStr) : null;
    }

    public void revokeAppAccess(String tenantId, UUID memberId) {
        Map<String, String> body = new HashMap<>();
        body.put("tenantId", tenantId);
        body.put("memberId", memberId.toString());
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.set("X-Internal-Key", internalKey);
        restTemplate.exchange(
                userServiceUrl + "/internal/users/revoke-app-access", HttpMethod.POST,
                new HttpEntity<>(body, headers), Map.class);
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
