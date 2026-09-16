package com.chitfund.supportservice.client;

import com.chitfund.supportservice.dto.request.PrepareIdentityCaseRequest;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.util.LinkedHashMap;
import java.util.Map;

@Component
public class IdentityExecutionClient {
    private final RestClient restClient;
    private final String internalKey;
    private final ObjectMapper objectMapper;

    public IdentityExecutionClient(RestClient.Builder builder, ObjectMapper objectMapper,
                                   @Value("${app.user-service-url:http://localhost:8081}") String baseUrl,
                                   @Value("${app.internal-key}") String internalKey) {
        this.restClient = builder.baseUrl(baseUrl).build();
        this.objectMapper = objectMapper;
        this.internalKey = internalKey;
    }

    @SuppressWarnings("unchecked")
    public Map<String, Object> executePhoneReassignment(String operationId, String proposalJson) {
        PrepareIdentityCaseRequest proposal;
        try {
            proposal = objectMapper.readValue(proposalJson, PrepareIdentityCaseRequest.class);
        } catch (JsonProcessingException ex) {
            throw new IllegalArgumentException("Approved identity proposal is unreadable", ex);
        }
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("operationId", operationId);
        body.put("oldUserId", proposal.getOldUserId());
        body.put("phoneCountryCode", proposal.getPhoneCountryCode());
        body.put("phone", proposal.getPhone());
        body.put("email", proposal.getEmail());
        body.put("approvedMemberLinks", proposal.getApprovedMemberLinks());
        Map<String, Object> response = restClient.post()
                .uri("/internal/users/identity-operations/phone-reassignment")
                .header("X-Internal-Key", internalKey)
                .contentType(MediaType.APPLICATION_JSON)
                .body(body)
                .retrieve()
                .body(Map.class);
        if (response == null) throw new IllegalStateException("Identity service returned no result");
        return response;
    }
}
