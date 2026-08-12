package com.chitfund.paymentservice.client;

import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

import java.util.HashMap;
import java.util.Map;

@Component
@RequiredArgsConstructor
@Slf4j
public class AuditClient {

    private final RestTemplate restTemplate;
    private final ObjectMapper objectMapper;

    @Value("${app.audit-service-url:http://localhost:8088}")
    private String auditServiceUrl;

    @Value("${app.internal-key:chitfund-internal-service-key}")
    private String internalKey;

    public void log(String entityType, String entityId, String chitId,
                    String action, String actorId, String actorRole,
                    Object before, Object after, String tenantId) {
        try {
            Map<String, Object> body = new HashMap<>();
            body.put("serviceName", "payment-service");
            body.put("entityType", entityType);
            body.put("entityId", entityId);
            if (chitId != null)    body.put("chitId", chitId);
            body.put("action", action);
            if (actorId != null)   body.put("actorId", actorId);
            if (actorRole != null) body.put("actorRole", actorRole);
            if (before != null)    body.put("beforeState", objectMapper.writeValueAsString(before));
            if (after  != null)    body.put("afterState",  objectMapper.writeValueAsString(after));
            if (tenantId != null)  body.put("tenantId", tenantId);

            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            headers.set("X-Internal-Key", internalKey);

            restTemplate.postForObject(
                    auditServiceUrl + "/internal/audit",
                    new HttpEntity<>(body, headers),
                    Void.class);
        } catch (RestClientException | com.fasterxml.jackson.core.JsonProcessingException e) {
            log.warn("Audit log failed for {} {} action={}: {}", entityType, entityId, action, e.getMessage());
        }
    }
}
