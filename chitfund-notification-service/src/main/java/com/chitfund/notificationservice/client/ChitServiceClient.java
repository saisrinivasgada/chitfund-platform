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
 * Fetches active member IDs for a chit so notification-service can fan out
 * draw-result notifications to every participant — not just the winner.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class ChitServiceClient {

    private final RestTemplate restTemplate;

    @Value("${app.chit-service-url:http://localhost:8082}")
    private String chitServiceUrl;

    @Value("${app.internal-key:chitfund-internal-service-key}")
    private String internalKey;

    @SuppressWarnings("unchecked")
    public List<String> getActiveMemberIds(String chitId) {
        try {
            HttpHeaders headers = new HttpHeaders();
            headers.set("X-Internal-Key", internalKey);

            ResponseEntity<Map<String, Object>> resp = restTemplate.exchange(
                    chitServiceUrl + "/internal/chits/" + chitId + "/member-ids",
                    HttpMethod.GET,
                    new HttpEntity<>(headers),
                    new ParameterizedTypeReference<>() {});

            if (resp.getBody() != null && resp.getBody().get("data") instanceof List<?> data) {
                return (List<String>) data;
            }
            return Collections.emptyList();
        } catch (RestClientException e) {
            log.warn("chit-service unreachable for member-ids chitId={}: {}", chitId, e.getMessage());
            return Collections.emptyList();
        }
    }
}
