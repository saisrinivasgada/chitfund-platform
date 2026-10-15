package com.chitfund.chitservice.client;

import com.chitfund.common.event.SqsQueues;
import com.chitfund.common.outbox.DurableAuditOutbox;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

class AuditClientTest {

    private final DurableAuditOutbox outbox = mock(DurableAuditOutbox.class);
    private final AuditClient client = new AuditClient(outbox, new ObjectMapper());

    @AfterEach
    void clearTransactionFlag() {
        TransactionSynchronizationManager.setActualTransactionActive(false);
    }

    @Test
    void rejectsAuditOutsideBusinessTransaction() {
        assertThatThrownBy(() -> client.log("CHIT", "entity", "chit", "UPDATED", "actor",
                "ADMIN", null, null, "tenant"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("business transaction");
        verify(outbox, never()).enqueue(anyString(), anyString(), anyString(),
                anyString(), anyString(), anyString());
    }

    @Test
    void enqueuesAuditInsideBusinessTransaction() {
        TransactionSynchronizationManager.setActualTransactionActive(true);
        client.log("CHIT", "entity", "chit", "UPDATED", "actor", "ADMIN",
                Map.of("status", "DRAFT"), Map.of("status", "ACTIVE"), "tenant");

        var payload = org.mockito.ArgumentCaptor.forClass(String.class);
        verify(outbox).enqueue(anyString(), org.mockito.ArgumentMatchers.eq("tenant"),
                org.mockito.ArgumentMatchers.eq("CHIT"),
                org.mockito.ArgumentMatchers.eq("entity"), payload.capture(),
                org.mockito.ArgumentMatchers.eq(SqsQueues.AUDIT_EVENTS));
        assertThat(payload.getValue()).contains("UPDATED", "DRAFT", "ACTIVE", "chit");
    }
}
