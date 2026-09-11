package com.chitfund.payoutservice.kafka;

import com.chitfund.common.context.TenantContext;
import com.chitfund.common.event.PayoutCreatedEvent;
import com.chitfund.common.event.SqsEventEnvelope;
import com.chitfund.common.event.SqsQueues;
import com.chitfund.payoutservice.config.EventDeliveryProperties;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.awspring.cloud.sqs.operations.SqsTemplate;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionSynchronizationUtils;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

class PayoutEventPublisherTest {

    private SqsTemplate sqsTemplate;
    private PayoutOutboxStore store;
    private EventDeliveryProperties properties;
    private ObjectMapper objectMapper;
    private PayoutEventPublisher publisher;

    @BeforeEach
    void setUp() {
        TenantContext.set("tenant-test");
        TransactionSynchronizationManager.initSynchronization();
        TransactionSynchronizationManager.setActualTransactionActive(true);
        sqsTemplate = mock(SqsTemplate.class);
        store = mock(PayoutOutboxStore.class);
        properties = new EventDeliveryProperties();
        objectMapper = new ObjectMapper().findAndRegisterModules();
        publisher = new PayoutEventPublisher(sqsTemplate, objectMapper, store, properties);
    }

    @AfterEach
    void tearDown() {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.clearSynchronization();
        }
        TransactionSynchronizationManager.setActualTransactionActive(false);
        TenantContext.clear();
    }

    @Test
    void legacyDeliveryWaitsForCommit() {
        publisher.publish(event());
        verify(sqsTemplate, never()).send(anyString(), anyString());

        TransactionSynchronizationUtils.invokeAfterCommit(
                TransactionSynchronizationManager.getSynchronizations());

        verify(sqsTemplate, times(1)).send(eq(SqsQueues.NOTIFICATION_EVENTS), anyString());
        verify(sqsTemplate, times(1)).send(eq(SqsQueues.REPORTING_EVENTS), anyString());
    }

    @Test
    void legacyDeliveryPublishesNothingAfterRollback() {
        publisher.publish(event());
        TransactionSynchronizationUtils.invokeAfterCompletion(
                TransactionSynchronizationManager.getSynchronizations(),
                TransactionSynchronization.STATUS_ROLLED_BACK);
        verify(sqsTemplate, never()).send(anyString(), anyString());
    }

    @Test
    void outboxUsesOneStableIdForBothDestinations() {
        properties.setMode(EventDeliveryProperties.Mode.OUTBOX);
        publisher.publish(event());

        ArgumentCaptor<String> eventId = ArgumentCaptor.forClass(String.class);
        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<String>> destinations = ArgumentCaptor.forClass(List.class);
        verify(store).enqueue(eventId.capture(), eq("tenant-test"), eq("payout"),
                eq(SqsQueues.EVT_PAYOUT_CREATED), anyString(), destinations.capture());
        assertThat(eventId.getValue()).hasSize(36);
        assertThat(destinations.getValue()).containsExactly(
                SqsQueues.NOTIFICATION_EVENTS, SqsQueues.REPORTING_EVENTS);
    }

    @Test
    void dualDeliveryCarriesTheOutboxIdOnLegacyPath() throws Exception {
        properties.setMode(EventDeliveryProperties.Mode.DUAL);
        publisher.publish(event());
        ArgumentCaptor<String> eventId = ArgumentCaptor.forClass(String.class);
        verify(store).enqueue(eventId.capture(), anyString(), anyString(),
                anyString(), anyString(), any());
        TransactionSynchronizationUtils.invokeAfterCommit(
                TransactionSynchronizationManager.getSynchronizations());

        ArgumentCaptor<String> envelopes = ArgumentCaptor.forClass(String.class);
        verify(sqsTemplate, times(2)).send(anyString(), envelopes.capture());
        for (String raw : envelopes.getAllValues()) {
            assertThat(objectMapper.readValue(raw, SqsEventEnvelope.class).eventId())
                    .isEqualTo(eventId.getValue());
        }
    }

    @Test
    void outboxRequiresBusinessTransaction() {
        properties.setMode(EventDeliveryProperties.Mode.OUTBOX);
        TransactionSynchronizationManager.clearSynchronization();
        TransactionSynchronizationManager.setActualTransactionActive(false);
        assertThatThrownBy(() -> publisher.publish(event()))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("business transaction");
    }

    private PayoutCreatedEvent event() {
        return new PayoutCreatedEvent(
                "payout", "chit", "member", 1,
                new BigDecimal("1000.00"), new BigDecimal("100.00"),
                new BigDecimal("900.00"), "admin", Instant.now(), "tenant-test");
    }
}
