package com.chitfund.paymentservice.kafka;

import com.chitfund.common.event.SqsEventEnvelope;
import com.chitfund.paymentservice.config.EventDeliveryProperties;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.awspring.cloud.sqs.operations.SqsTemplate;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.time.Duration;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class PaymentOutboxRelayTest {

    private PaymentOutboxStore store;
    private SqsTemplate sqsTemplate;
    private EventDeliveryProperties properties;
    private ObjectMapper objectMapper;
    private PaymentOutboxRelay relay;
    private SimpleMeterRegistry meterRegistry;

    @BeforeEach
    void setUp() {
        store = mock(PaymentOutboxStore.class);
        sqsTemplate = mock(SqsTemplate.class);
        properties = new EventDeliveryProperties();
        properties.setMode(EventDeliveryProperties.Mode.OUTBOX);
        properties.setBatchSize(25);
        properties.setMaxAttempts(3);
        properties.setLeaseDuration(Duration.ofSeconds(20));
        objectMapper = new ObjectMapper();
        meterRegistry = new SimpleMeterRegistry();
        relay = new PaymentOutboxRelay(
                store, sqsTemplate, objectMapper, properties,
                meterRegistry);
    }

    @Test
    void publishesOutsideDatabaseTransactionAndFinalizesByLease() throws Exception {
        OutboxDelivery delivery = delivery(0);
        when(store.claimBatch(25, Duration.ofSeconds(20))).thenReturn(List.of(delivery));
        when(store.markPublished(delivery)).thenReturn(true);
        doAnswer(invocation -> {
            assertThat(TransactionSynchronizationManager.isActualTransactionActive()).isFalse();
            return null;
        }).when(sqsTemplate).send(eq("queue"), anyString());

        relay.drain();

        ArgumentCaptor<String> raw = ArgumentCaptor.forClass(String.class);
        verify(sqsTemplate).send(eq("queue"), raw.capture());
        SqsEventEnvelope envelope = objectMapper.readValue(raw.getValue(), SqsEventEnvelope.class);
        assertThat(envelope.eventId()).isEqualTo("event-id");
        assertThat(envelope.eventType()).isEqualTo("PAYMENT_COMPLETED");
        assertThat(envelope.payload()).isEqualTo("{\"amount\":100}");
        verify(store).markPublished(delivery);
    }

    @Test
    void failedPublishSchedulesRetryWithoutMarkingSuccess() {
        OutboxDelivery delivery = delivery(1);
        when(store.claimBatch(25, Duration.ofSeconds(20))).thenReturn(List.of(delivery));
        doThrow(new IllegalStateException("Authorization=secret-token endpoint failed"))
                .when(sqsTemplate).send(eq("queue"), anyString());
        when(store.markFailed(eq(delivery), eq(3), any(),
                eq("IllegalStateException"), eq("Authorization=[REDACTED] endpoint failed")))
                .thenReturn(new PaymentOutboxStore.FailureResult(true, false, 2));

        relay.drain();

        verify(store, never()).markPublished(any());
        verify(store).markFailed(eq(delivery), eq(3), any(),
                eq("IllegalStateException"), eq("Authorization=[REDACTED] endpoint failed"));
    }

    @Test
    void relayDoesNothingUntilOutboxModeIsEnabled() {
        properties.setMode(EventDeliveryProperties.Mode.LEGACY);

        relay.drain();

        verify(store, never()).claimBatch(any(Integer.class), any(Duration.class));
    }

    @Test
    void refreshesPendingFailedAndOldestAgeGauges() {
        when(store.claimBatch(25, Duration.ofSeconds(20))).thenReturn(List.of());
        when(store.countByStatus("PENDING")).thenReturn(4L);
        when(store.countByStatus("IN_FLIGHT")).thenReturn(2L);
        when(store.countByStatus("FAILED")).thenReturn(3L);
        when(store.oldestUnpublishedAgeSeconds()).thenReturn(45L);

        relay.drain();

        assertThat(meterRegistry.get("chitwise.outbox.pending").gauge().value()).isEqualTo(6);
        assertThat(meterRegistry.get("chitwise.outbox.failed.current").gauge().value()).isEqualTo(3);
        assertThat(meterRegistry.get("chitwise.outbox.oldest.unpublished.seconds")
                .gauge().value()).isEqualTo(45);
    }

    @Test
    void sanitizesMultilineSecretsAndBoundsStoredErrors() {
        String secret = "password=hunter2\n" + "x".repeat(2100);
        String sanitized = PaymentOutboxRelay.sanitize(secret);

        assertThat(sanitized).doesNotContain("hunter2").doesNotContain("\n");
        assertThat(sanitized.length()).isLessThanOrEqualTo(2000);
    }

    private OutboxDelivery delivery(int attempts) {
        return new OutboxDelivery(
                "delivery-id", "event-id", "PAYMENT_COMPLETED", "queue",
                "{\"amount\":100}", attempts, "lease-token");
    }
}
