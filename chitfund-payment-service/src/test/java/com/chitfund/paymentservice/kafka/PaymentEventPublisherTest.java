package com.chitfund.paymentservice.kafka;

import com.chitfund.common.context.TenantContext;
import com.chitfund.common.event.ChitMonthOpenedEvent;
import com.chitfund.common.event.ChitMonthSkippedEvent;
import com.chitfund.common.event.PaymentCompletedEvent;
import com.chitfund.common.event.SqsEventEnvelope;
import com.chitfund.common.event.SqsQueues;
import com.chitfund.paymentservice.config.EventDeliveryProperties;
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
import java.time.LocalDate;
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

class PaymentEventPublisherTest {

    private SqsTemplate sqsTemplate;
    private PaymentOutboxStore outboxStore;
    private EventDeliveryProperties properties;
    private ObjectMapper objectMapper;
    private PaymentEventPublisher publisher;

    @BeforeEach
    void setUp() {
        TenantContext.set("tenant-test");
        TransactionSynchronizationManager.initSynchronization();
        TransactionSynchronizationManager.setActualTransactionActive(true);
        sqsTemplate = mock(SqsTemplate.class);
        outboxStore = mock(PaymentOutboxStore.class);
        properties = new EventDeliveryProperties();
        objectMapper = new ObjectMapper().findAndRegisterModules();
        publisher = new PaymentEventPublisher(
                sqsTemplate, objectMapper, outboxStore, properties);
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
    void committedLegacyDrawPublishesEachDestinationExactlyOnce() {
        properties.setMode(EventDeliveryProperties.Mode.LEGACY);
        publisher.publish(openedEvent());

        verify(sqsTemplate, never()).send(anyString(), anyString());
        commitCallbacks();
        verify(sqsTemplate, times(1)).send(eq(SqsQueues.NOTIFICATION_EVENTS), anyString());
        verify(sqsTemplate, times(1)).send(eq(SqsQueues.REPORTING_EVENTS), anyString());
    }

    @Test
    void rolledBackLegacyDrawPublishesNothing() {
        properties.setMode(EventDeliveryProperties.Mode.LEGACY);
        publisher.publish(openedEvent());

        rollbackCallbacks();
        verify(sqsTemplate, never()).send(anyString(), anyString());
    }

    @Test
    void committedLegacySkipPublishesEachDestinationExactlyOnce() {
        properties.setMode(EventDeliveryProperties.Mode.LEGACY);
        publisher.publish(skippedEvent());

        verify(sqsTemplate, never()).send(anyString(), anyString());
        commitCallbacks();
        verify(sqsTemplate, times(1)).send(eq(SqsQueues.NOTIFICATION_EVENTS), anyString());
        verify(sqsTemplate, times(1)).send(eq(SqsQueues.REPORTING_EVENTS), anyString());
    }

    @Test
    void rolledBackLegacySkipPublishesNothing() {
        properties.setMode(EventDeliveryProperties.Mode.LEGACY);
        publisher.publish(skippedEvent());

        rollbackCallbacks();
        verify(sqsTemplate, never()).send(anyString(), anyString());
    }

    @Test
    void outboxUsesOneStableEventIdForEveryDestination() {
        properties.setMode(EventDeliveryProperties.Mode.OUTBOX);
        publisher.publish(paymentEvent());

        ArgumentCaptor<String> eventId = ArgumentCaptor.forClass(String.class);
        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<String>> destinations = ArgumentCaptor.forClass(List.class);
        verify(outboxStore).enqueue(
                eventId.capture(), eq("tenant-test"), eq("PAYMENT_BATCH"), eq("batch"),
                eq(SqsQueues.EVT_PAYMENT_COMPLETED), anyString(), destinations.capture());
        assertThat(eventId.getValue()).hasSize(36);
        assertThat(destinations.getValue()).containsExactly(
                SqsQueues.NOTIFICATION_EVENTS,
                SqsQueues.AUDIT_EVENTS,
                SqsQueues.REPORTING_EVENTS);
        commitCallbacks();
        verify(sqsTemplate, never()).send(anyString(), anyString());
    }

    @Test
    void dualPublicationCarriesTheOutboxEventIdOnLegacyPath() throws Exception {
        properties.setMode(EventDeliveryProperties.Mode.DUAL);
        publisher.publish(openedEvent());

        ArgumentCaptor<String> outboxEventId = ArgumentCaptor.forClass(String.class);
        verify(outboxStore).enqueue(
                outboxEventId.capture(), eq("tenant-test"), eq("CHIT"), eq("chit"),
                eq(SqsQueues.EVT_MONTH_OPENED), anyString(), any());
        commitCallbacks();

        ArgumentCaptor<String> rawEnvelope = ArgumentCaptor.forClass(String.class);
        verify(sqsTemplate, times(2)).send(anyString(), rawEnvelope.capture());
        for (String raw : rawEnvelope.getAllValues()) {
            SqsEventEnvelope envelope = objectMapper.readValue(raw, SqsEventEnvelope.class);
            assertThat(envelope.eventId()).isEqualTo(outboxEventId.getValue());
        }
    }

    @Test
    void outboxPublicationWithoutBusinessTransactionIsRejected() {
        properties.setMode(EventDeliveryProperties.Mode.OUTBOX);
        TransactionSynchronizationManager.clearSynchronization();
        TransactionSynchronizationManager.setActualTransactionActive(false);

        assertThatThrownBy(() -> publisher.publish(paymentEvent()))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("business transaction");
    }

    private void commitCallbacks() {
        TransactionSynchronizationUtils.invokeAfterCommit(
                TransactionSynchronizationManager.getSynchronizations());
    }

    private void rollbackCallbacks() {
        TransactionSynchronizationUtils.invokeAfterCompletion(
                TransactionSynchronizationManager.getSynchronizations(),
                TransactionSynchronization.STATUS_ROLLED_BACK);
    }

    private ChitMonthOpenedEvent openedEvent() {
        return new ChitMonthOpenedEvent(
                "tenant-test", "chit", "Test chit", 1,
                LocalDate.of(2026, 9, 10), new BigDecimal("1000.00"), 1,
                List.of("member"), "admin", "ADMIN", Instant.now());
    }

    private PaymentCompletedEvent paymentEvent() {
        return new PaymentCompletedEvent(
                "batch", "chit", "member", new BigDecimal("1000.00"), "UPI",
                new BigDecimal("1000.00"), new BigDecimal("1000.00"), BigDecimal.ZERO,
                1, 0, 0, 0, LocalDate.of(2026, 9, 10),
                "admin", Instant.now(), "tenant-test");
    }

    private ChitMonthSkippedEvent skippedEvent() {
        return new ChitMonthSkippedEvent(
                "tenant-test", "chit", "Test chit", 1,
                LocalDate.of(2026, 9, 10), new BigDecimal("1000.00"), 1,
                List.of("member"), "test skip", "admin", "ADMIN", Instant.now());
    }
}
