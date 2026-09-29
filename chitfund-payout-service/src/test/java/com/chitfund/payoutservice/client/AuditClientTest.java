package com.chitfund.payoutservice.client;

import com.chitfund.common.event.AuditLogEvent;
import com.chitfund.common.event.SqsQueues;
import com.chitfund.payoutservice.kafka.PayoutOutboxStore;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

class AuditClientTest {

    @AfterEach
    void clearTransactionState() {
        TransactionSynchronizationManager.setActualTransactionActive(false);
    }

    @Test
    void recordsAuditInTheBusinessTransactionOutbox() throws Exception {
        PayoutOutboxStore store = mock(PayoutOutboxStore.class);
        ObjectMapper mapper = new ObjectMapper();
        AuditClient client = new AuditClient(store, mapper);
        TransactionSynchronizationManager.setActualTransactionActive(true);

        client.log("PAYOUT", "payout-1", "chit-1", "PAYOUT_DISBURSED",
                "admin-1", "ADMIN", Map.of("status", "PENDING"),
                Map.of("status", "DISBURSED"), "tenant-1");

        ArgumentCaptor<String> payload = ArgumentCaptor.forClass(String.class);
        verify(store).enqueue(anyString(), eq("tenant-1"), eq("PAYOUT"), eq("payout-1"),
                eq(SqsQueues.EVT_AUDIT_LOG), payload.capture(),
                eq(List.of(SqsQueues.AUDIT_EVENTS)));
        AuditLogEvent event = mapper.readValue(payload.getValue(), AuditLogEvent.class);
        assertThat(event.serviceName()).isEqualTo("payout-service");
        assertThat(event.action()).isEqualTo("PAYOUT_DISBURSED");
        assertThat(event.beforeState()).contains("PENDING");
        assertThat(event.afterState()).contains("DISBURSED");
        assertThat(event.outcome()).isEqualTo("SUCCESS");
    }

    @Test
    void carriesFinancialIdempotencyKeyIntoTheAuditEvent() throws Exception {
        PayoutOutboxStore store = mock(PayoutOutboxStore.class);
        ObjectMapper mapper = new ObjectMapper();
        AuditClient client = new AuditClient(store, mapper);
        TransactionSynchronizationManager.setActualTransactionActive(true);

        client.log("PAYOUT", "payout-1", "chit-1", "PAYOUT_CREATED",
                "admin-1", "ADMIN", null, Map.of("status", "PENDING"),
                "tenant-1", "create-key-1");

        ArgumentCaptor<String> payload = ArgumentCaptor.forClass(String.class);
        verify(store).enqueue(anyString(), eq("tenant-1"), eq("PAYOUT"), eq("payout-1"),
                eq(SqsQueues.EVT_AUDIT_LOG), payload.capture(),
                eq(List.of(SqsQueues.AUDIT_EVENTS)));
        AuditLogEvent event = mapper.readValue(payload.getValue(), AuditLogEvent.class);
        assertThat(event.idempotencyKey()).isEqualTo("create-key-1");
    }

    @Test
    void refusesToCreateAnAuditOutsideTheBusinessTransaction() {
        PayoutOutboxStore store = mock(PayoutOutboxStore.class);
        AuditClient client = new AuditClient(store, new ObjectMapper());

        assertThatThrownBy(() -> client.log("PAYOUT", "id", null, "CREATED",
                "actor", "ADMIN", null, null, "tenant-1"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("business transaction");
        verify(store, never()).enqueue(anyString(), anyString(), anyString(), anyString(),
                anyString(), anyString(), org.mockito.ArgumentMatchers.anyList());
    }
}
