package com.chitfund.userservice.client;

import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestTemplate;

import java.util.Map;
import java.util.UUID;

@Component
@RequiredArgsConstructor
public class MemberServiceClient {
    private final RestTemplate restTemplate;

    @Value("${app.member-service-url:http://localhost:8083}")
    private String memberServiceUrl;
    @Value("${app.internal-key}")
    private String internalKey;

    public void activateAppAccess(UUID tenantId, UUID memberId, UUID userId, UUID requestId) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.set("X-Internal-Key", internalKey);
        Map<String, String> body = Map.of(
                "tenantId", tenantId.toString(),
                "userId", userId.toString(),
                "requestId", requestId.toString());
        ResponseEntity<Map> response = restTemplate.exchange(
                memberServiceUrl + "/internal/members/" + memberId + "/app-access",
                HttpMethod.PUT, new HttpEntity<>(body, headers), Map.class);
        if (!response.getStatusCode().is2xxSuccessful()
                || response.getBody() == null
                || !Boolean.TRUE.equals(response.getBody().get("success"))) {
            throw new IllegalStateException("Member app-access activation was not completed");
        }
    }

    public boolean memberProfileExists(UUID tenantId, UUID memberId) {
        HttpHeaders headers = new HttpHeaders();
        headers.set("X-Internal-Key", internalKey);
        ResponseEntity<Map> response = restTemplate.exchange(
                memberServiceUrl + "/internal/members/" + memberId + "/tenant/" + tenantId + "/exists",
                HttpMethod.GET, new HttpEntity<>(headers), Map.class);
        return response.getStatusCode().is2xxSuccessful()
                && response.getBody() != null
                && Boolean.TRUE.equals(response.getBody().get("exists"));
    }
}
