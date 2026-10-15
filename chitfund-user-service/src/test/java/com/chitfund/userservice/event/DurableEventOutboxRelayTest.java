package com.chitfund.userservice.event;

import com.chitfund.common.event.SqsEventEnvelope;
import com.chitfund.common.outbox.DurableEventOutbox;
import com.chitfund.common.outbox.DurableEventOutboxRelay;
import com.chitfund.common.outbox.EventOutboxDelivery;
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

class DurableEventOutboxRelayTest {

    private DurableEventOutbox store;
    private SqsTemplate sqsTemplate;
    private ObjectMapper objectMapper;
    private DurableEventOutboxRelay relay;

    @BeforeEach
    void setUp() {
        store = mock(DurableEventOutbox.class);
        sqsTemplate = mock(SqsTemplate.class);
        objectMapper = new ObjectMapper();
        relay = new DurableEventOutboxRelay(store, sqsTemplate, objectMapper,
                new SimpleMeterRegistry(), "user-service", 25, 3, Duration.ofSeconds(20));
    }

    @Test
    void publishesStableEnvelopeOutsideDatabaseTransaction() throws Exception {
        EventOutboxDelivery delivery = delivery(0);
        when(store.claimBatch(25, Duration.ofSeconds(20))).thenReturn(List.of(delivery));
        when(store.markPublished(delivery)).thenReturn(true);
        doAnswer(invocation -> {
            assertThat(TransactionSynchronizationManager.isActualTransactionActive()).isFalse();
            return null;
        }).when(sqsTemplate).send(eq("notification-events"), anyString());

        relay.drain();

        ArgumentCaptor<String> raw = ArgumentCaptor.forClass(String.class);
        verify(sqsTemplate).send(eq("notification-events"), raw.capture());
        SqsEventEnvelope envelope = objectMapper.readValue(raw.getValue(), SqsEventEnvelope.class);
        assertThat(envelope.eventId()).isEqualTo("event-id");
        assertThat(envelope.eventType()).isEqualTo("PUSH_NOTIFICATION");
        assertThat(envelope.payload()).isEqualTo("{\"title\":\"Test\"}");
        verify(store).markPublished(delivery);
    }

    @Test
    void failedPublishSchedulesRetryWithoutMarkingSuccess() {
        EventOutboxDelivery delivery = delivery(1);
        when(store.claimBatch(25, Duration.ofSeconds(20))).thenReturn(List.of(delivery));
        doThrow(new IllegalStateException("Authorization=secret-token endpoint failed"))
                .when(sqsTemplate).send(eq("notification-events"), anyString());
        when(store.markFailed(eq(delivery), eq(3), any(),
                eq("IllegalStateException"), eq("Authorization=[REDACTED] endpoint failed")))
                .thenReturn(new DurableEventOutbox.FailureResult(true, false, 2));

        relay.drain();

        verify(store, never()).markPublished(any());
        verify(store).markFailed(eq(delivery), eq(3), any(),
                eq("IllegalStateException"), eq("Authorization=[REDACTED] endpoint failed"));
    }

    private EventOutboxDelivery delivery(int attempts) {
        return new EventOutboxDelivery(
                "delivery-id", "event-id", "PUSH_NOTIFICATION", "notification-events",
                "{\"title\":\"Test\"}", attempts, "lease-token");
    }
}
