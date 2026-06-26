package com.chitfund.payoutservice.client;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestTemplate;

import java.util.UUID;

@Component
@RequiredArgsConstructor
@Slf4j
public class ChitServiceClient {

    private final RestTemplate restTemplate;

    @Value("${app.chit-service-url:http://localhost:8081}")
    private String chitServiceUrl;

    @Value("${app.internal-key:chitfund-internal-service-key}")
    private String internalKey;

    /**
     * Returns the chit's durationMonths so payout-service can check if all draws are done.
     * Returns -1 on error so the caller can skip the completion check safely.
     */
    public int getChitDurationMonths(UUID chitId) {
        HttpHeaders headers = new HttpHeaders();
        headers.set("X-Internal-Key", internalKey);

        try {
            @SuppressWarnings("unchecked")
            java.util.Map<String, Object> body = restTemplate.exchange(
                    chitServiceUrl + "/internal/chits/" + chitId,
                    org.springframework.http.HttpMethod.GET,
                    new HttpEntity<>(null, headers),
                    new org.springframework.core.ParameterizedTypeReference<java.util.Map<String, Object>>() {}
            ).getBody();

            if (body != null && body.get("data") instanceof java.util.Map) {
                @SuppressWarnings("unchecked")
                java.util.Map<String, Object> data = (java.util.Map<String, Object>) body.get("data");
                Object months = data.get("durationMonths");
                if (months instanceof Number) return ((Number) months).intValue();
            }
        } catch (Exception e) {
            log.error("Failed to fetch durationMonths for chit {} — {}", chitId, e.getMessage());
        }
        return -1;
    }

    /**
     * Signals chit-service that all draws for this chit are disbursed — it should mark the chit COMPLETED.
     * Fire-and-forget: a failure here is logged but never fails the disbursement itself.
     * Chit-service guards against duplicate calls (COMPLETED → COMPLETED is a no-op).
     */
    public void markChitCompleted(UUID chitId) {
        HttpHeaders headers = new HttpHeaders();
        headers.set("X-Internal-Key", internalKey);

        try {
            restTemplate.postForObject(
                    chitServiceUrl + "/internal/chits/" + chitId + "/complete",
                    new HttpEntity<>(null, headers),
                    Void.class
            );
            log.info("Chit {} marked COMPLETED via internal call — all draws disbursed", chitId);
        } catch (Exception e) {
            log.error("Failed to auto-complete chit {} — chit may need manual completion: {}", chitId, e.getMessage());
        }
    }
}
