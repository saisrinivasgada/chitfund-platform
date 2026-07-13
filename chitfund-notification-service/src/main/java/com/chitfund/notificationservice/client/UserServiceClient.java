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

/**
 * Looks up user account UUIDs by role so notification-service can fan out
 * in-app notifications to all admins or managers without knowing their IDs upfront.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class UserServiceClient {

    private final RestTemplate restTemplate;

    @Value("${app.user-service-url:http://localhost:8081}")
    private String userServiceUrl;

    @Value("${app.internal-key:chitfund-internal-service-key}")
    private String internalKey;

    public List<String> getUserIdsByRole(String role) {
        try {
            HttpHeaders headers = new HttpHeaders();
            headers.set("X-Internal-Key", internalKey);

            ResponseEntity<List<String>> resp = restTemplate.exchange(
                    userServiceUrl + "/internal/users/ids-by-role?role=" + role,
                    HttpMethod.GET,
                    new HttpEntity<>(headers),
                    new ParameterizedTypeReference<>() {});

            return resp.getBody() != null ? resp.getBody() : Collections.emptyList();
        } catch (RestClientException e) {
            log.warn("user-service unreachable for role={} lookup: {}", role, e.getMessage());
            return Collections.emptyList();
        }
    }
}
