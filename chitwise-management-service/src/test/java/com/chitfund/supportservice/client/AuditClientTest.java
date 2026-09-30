package com.chitfund.supportservice.client;

import com.chitfund.common.event.SqsQueues;
import com.chitfund.common.outbox.DurableAuditOutbox;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.slf4j.MDC;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

class AuditClientTest {

    private final DurableAuditOutbox outbox = mock(DurableAuditOutbox.class);
    private final AuditClient client = new AuditClient(outbox, new ObjectMapper());

    @AfterEach
    void clearTransactionFlag() {
        TransactionSynchronizationManager.setActualTransactionActive(false);
        MDC.clear();
    }

    @Test
    void rejectsTicketAuditOutsideBusinessTransaction() {
        assertThatThrownBy(() -> client.log("ticket-1", "CREATED", "actor-1", "ADMIN",
                null, Map.of("status", "OPEN"), null, "tenant-1", null))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("business transaction");

        verify(outbox, never()).enqueue(anyString(), anyString(), anyString(),
                anyString(), anyString(), anyString());
    }

    @Test
    void queuesPrivacySafeTicketAuditInsideBusinessTransaction() {
        TransactionSynchronizationManager.setActualTransactionActive(true);

        client.log("ticket-1", "MESSAGE_SENT", "actor-1", "SUPPORT_AGENT",
                null, Map.of("messageId", "message-1"),
                Map.of("senderType", "SUPPORT_AGENT"), "tenant-1", null);

        var payload = org.mockito.ArgumentCaptor.forClass(String.class);
        verify(outbox).enqueue(anyString(), eq("tenant-1"), eq("TICKET"), eq("ticket-1"),
                payload.capture(), eq(SqsQueues.AUDIT_EVENTS));
        assertThat(payload.getValue())
                .contains("MESSAGE_SENT", "message-1", "SUPPORT_AGENT")
                .doesNotContain("content", "requesterEmail", "requesterPhone");
    }

    @Test
    void queuesPlatformEntityAuditWithItsRealEntityType() {
        TransactionSynchronizationManager.setActualTransactionActive(true);
        MDC.put("requestId", "request-42");
        MDC.put("source", "WEB");
        MDC.put("ip", "203.0.113.9");
        MDC.put("idempotencyKey", "employee-change-1");
        MDC.put("deviceSessionHash", "safe-device-hash");

        client.logEntity("HUB_EMPLOYEE", "employee-1", "DEACTIVATED",
                "owner-1", "SUPER_ADMIN", Map.of("active", true),
                Map.of("active", false), Map.of("sessionsRevoked", true),
                "PLATFORM", "Security review");

        var payload = org.mockito.ArgumentCaptor.forClass(String.class);
        verify(outbox).enqueue(anyString(), eq("PLATFORM"), eq("HUB_EMPLOYEE"),
                eq("employee-1"), payload.capture(), eq(SqsQueues.AUDIT_EVENTS));
        assertThat(payload.getValue())
                .contains("DEACTIVATED", "SUPER_ADMIN", "sessionsRevoked",
                        "\"correlationId\":\"request-42\"",
                        "\"source\":\"WEB\"",
                        "\"actorIp\":\"203.0.113.9\"",
                        "\"idempotencyKey\":\"employee-change-1\"",
                        "\"deviceSessionHash\":\"safe-device-hash\"")
                .doesNotContain("password", "token");
    }
}
