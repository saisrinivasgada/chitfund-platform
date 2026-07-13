package com.chitfund.paymentservice.client;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

import java.util.Map;
import java.util.UUID;

/**
 * Sends in-app notifications to notification-service so they appear in the bell.
 * Best-effort: failures are logged and never block the payment flow.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class NotificationServiceClient {

    private final RestTemplate restTemplate;

    @Value("${app.notification-service-url:http://localhost:8086}")
    private String notificationServiceUrl;

    @Value("${app.internal-key:chitfund-internal-service-key}")
    private String internalKey;

    public void createInApp(UUID recipientId, String title, String message, String type, String link) {
        try {
            HttpHeaders headers = new HttpHeaders();
            headers.set("X-Internal-Key", internalKey);
            headers.setContentType(MediaType.APPLICATION_JSON);

            Map<String, Object> body = new java.util.HashMap<>();
            body.put("recipientId", recipientId.toString());
            body.put("title", title);
            body.put("message", message);
            body.put("type", type);
            if (link != null) body.put("link", link);

            restTemplate.postForObject(
                    notificationServiceUrl + "/internal/notify/in-app",
                    new HttpEntity<>(body, headers),
                    Void.class);
        } catch (RestClientException e) {
            log.warn("notification-service unreachable for in-app notification to {}: {}", recipientId, e.getMessage());
        }
    }
}
