package com.chitfund.notificationservice.service;

import com.chitfund.notificationservice.repository.UserPushTokenRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Sends push notifications to mobile devices via the Expo Push HTTP API.
 *
 * Expo acts as a unified gateway for both iOS (APNs) and Android (FCM) —
 * we send one request to Expo's API and it fans out to the correct platform.
 *
 * Docs: https://docs.expo.dev/push-notifications/sending-notifications/
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class ExpoPushService {

    private static final String EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

    private final UserPushTokenRepository pushTokenRepository;
    private final RestTemplate restTemplate;
    private final ObjectMapper objectMapper;

    /**
     * Sends a push notification to all registered devices of a user.
     * Silently skips if the user has no tokens.
     */
    public void sendToUser(UUID userId, String title, String body) {
        sendToUserWithData(userId, title, body, null);
    }

    public void sendToUserWithData(UUID userId, String title, String body, Map<String, String> data) {
        List<String> tokens = pushTokenRepository.findByUserId(userId)
                .stream()
                .map(t -> t.getToken())
                .filter(t -> t.startsWith("ExponentPushToken") || t.startsWith("ExpoPushToken"))
                .toList();

        if (tokens.isEmpty()) return;

        for (String token : tokens) {
            sendPush(token, title, body, data);
        }
    }

    private void sendPush(String token, String title, String body, Map<String, String> data) {
        try {
            java.util.HashMap<String, Object> payload = new java.util.HashMap<>();
            payload.put("to", token);
            payload.put("title", title);
            payload.put("body", body);
            payload.put("sound", "default");
            payload.put("priority", "high");
            if (data != null && !data.isEmpty()) {
                payload.put("data", data);
            }

            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            headers.set("Accept", "application/json");
            headers.set("Accept-Encoding", "gzip, deflate");

            HttpEntity<java.util.HashMap<String, Object>> req = new HttpEntity<>(payload, headers);
            ResponseEntity<String> resp = restTemplate.postForEntity(EXPO_PUSH_URL, req, String.class);

            log.info("Expo push sent to token=...{} status={}", token.substring(Math.max(0, token.length() - 8)), resp.getStatusCode());
        } catch (Exception e) {
            log.warn("Expo push failed for token=...{}: {}", token.substring(Math.max(0, token.length() - 8)), e.getMessage());
        }
    }
}
