package com.chitfund.payoutservice.client;

import com.chitfund.common.event.AuditLogEvent;
import com.chitfund.common.event.SqsEventEnvelope;
import com.chitfund.common.event.SqsQueues;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.awspring.cloud.sqs.operations.SqsTemplate;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.UUID;
import java.util.concurrent.CompletableFuture;

@Component
@RequiredArgsConstructor
@Slf4j
public class AuditClient {

    private final SqsTemplate sqsTemplate;
    private final ObjectMapper objectMapper;

    public void log(String entityType, String entityId, String chitId,
                    String action, String actorId, String actorRole,
                    Object before, Object after, String tenantId) {
        CompletableFuture.runAsync(() -> {
            try {
                String beforeJson = before != null ? objectMapper.writeValueAsString(before) : null;
                String afterJson  = after  != null ? objectMapper.writeValueAsString(after)  : null;
                publish(new AuditLogEvent("payout-service", entityType, entityId, chitId,
                        action, actorId, actorRole, null, beforeJson, afterJson, null, tenantId));
            } catch (Exception e) {
                log.error("AUDIT_FAILURE: failed to queue audit event entity={} id={} action={}: {}",
                        entityType, entityId, action, e.getMessage());
            }
        });
    }

    private void publish(AuditLogEvent event) throws Exception {
        String payload  = objectMapper.writeValueAsString(event);
        String envelope = objectMapper.writeValueAsString(
                new SqsEventEnvelope(UUID.randomUUID().toString(), SqsQueues.EVT_AUDIT_LOG, payload));
        sqsTemplate.send(SqsQueues.AUDIT_EVENTS, envelope);
    }
}
