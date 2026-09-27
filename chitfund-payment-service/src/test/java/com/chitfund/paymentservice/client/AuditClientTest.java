package com.chitfund.paymentservice.client;

import com.chitfund.common.event.AuditLogEvent;
import com.chitfund.common.event.SqsQueues;
import com.chitfund.paymentservice.kafka.PaymentOutboxStore;
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
        PaymentOutboxStore store = mock(PaymentOutboxStore.class);
        ObjectMapper mapper = new ObjectMapper();
        AuditClient client = new AuditClient(store, mapper);
        TransactionSynchronizationManager.setActualTransactionActive(true);

        client.log("PAYMENT_BATCH", "batch-1", "chit-1", "PAYMENT_VOIDED",
                "admin-1", "ADMIN", Map.of("status", "COMPLETED"),
                Map.of("status", "VOIDED"), "tenant-1");

        ArgumentCaptor<String> payload = ArgumentCaptor.forClass(String.class);
        verify(store).enqueue(anyString(), eq("tenant-1"), eq("PAYMENT_BATCH"),
                eq("batch-1"), eq(SqsQueues.EVT_AUDIT_LOG), payload.capture(),
                eq(List.of(SqsQueues.AUDIT_EVENTS)));
        AuditLogEvent event = mapper.readValue(payload.getValue(), AuditLogEvent.class);
        assertThat(event.serviceName()).isEqualTo("payment-service");
        assertThat(event.action()).isEqualTo("PAYMENT_VOIDED");
        assertThat(event.beforeState()).contains("COMPLETED");
        assertThat(event.afterState()).contains("VOIDED");
    }

    @Test
    void refusesToCreateAnAuditOutsideTheBusinessTransaction() {
        PaymentOutboxStore store = mock(PaymentOutboxStore.class);
        AuditClient client = new AuditClient(store, new ObjectMapper());

        assertThatThrownBy(() -> client.log("PAYMENT", "id", null, "CREATED",
                "actor", "ADMIN", null, null, "tenant-1"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("business transaction");
        verify(store, never()).enqueue(anyString(), anyString(), anyString(), anyString(),
                anyString(), anyString(), org.mockito.ArgumentMatchers.anyList());
    }
}
