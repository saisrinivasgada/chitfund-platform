package com.chitfund.notificationservice.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.util.Map;

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

    private final RestTemplate restTemplate;

    public void sendToToken(String token, String title, String body, Map<String, String> data) {
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
        if (!resp.getStatusCode().is2xxSuccessful()) {
            throw new IllegalStateException("Expo returned HTTP " + resp.getStatusCode().value());
        }
        log.info("Expo push accepted for token=...{} status={}",
                token.substring(Math.max(0, token.length() - 8)), resp.getStatusCode());
    }
}
