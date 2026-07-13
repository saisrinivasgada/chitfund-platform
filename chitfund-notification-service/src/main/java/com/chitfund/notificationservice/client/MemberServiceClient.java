package com.chitfund.notificationservice.client;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.*;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

import java.util.Collections;
import java.util.List;
import java.util.Map;

/**
 * Resolves member profile UUIDs → user account UUIDs so in-app notifications
 * are stored with the correct recipientId (user account, not member profile).
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class MemberServiceClient {

    private final RestTemplate restTemplate;

    @Value("${app.member-service-url:http://localhost:8083}")
    private String memberServiceUrl;

    @Value("${app.internal-key:chitfund-internal-service-key}")
    private String internalKey;

    public Map<String, String> batchGetUserIds(List<String> memberIds) {
        if (memberIds == null || memberIds.isEmpty()) return Collections.emptyMap();
        try {
            HttpHeaders headers = new HttpHeaders();
            headers.set("X-Internal-Key", internalKey);
            headers.setContentType(MediaType.APPLICATION_JSON);

            ResponseEntity<Map<String, String>> resp = restTemplate.exchange(
                    memberServiceUrl + "/internal/members/batch-user-ids",
                    HttpMethod.POST,
                    new HttpEntity<>(memberIds, headers),
                    new ParameterizedTypeReference<>() {});

            return resp.getBody() != null ? resp.getBody() : Collections.emptyMap();
        } catch (RestClientException e) {
            log.warn("member-service unreachable for batch userId lookup: {}", e.getMessage());
            return Collections.emptyMap();
        }
    }

    public String getUserId(String memberId) {
        return batchGetUserIds(List.of(memberId)).getOrDefault(memberId, null);
    }
}
