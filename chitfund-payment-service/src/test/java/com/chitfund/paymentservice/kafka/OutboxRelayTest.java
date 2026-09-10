package com.chitfund.paymentservice.kafka;

import com.chitfund.paymentservice.domain.EventOutbox;
import com.chitfund.paymentservice.domain.enums.OutboxStatus;
import com.chitfund.paymentservice.repository.EventOutboxRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.awspring.cloud.sqs.operations.SqsTemplate;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class OutboxRelayTest {

    @Test
    void successfulSendMarksRowPublished() {
        EventOutboxRepository repository = mock(EventOutboxRepository.class);
        SqsTemplate sqs = mock(SqsTemplate.class);
        EventOutbox event = event(0);
        when(repository.claimBatch(100)).thenReturn(List.of(event));

        new OutboxRelay(repository, sqs, new ObjectMapper()).drain();

        verify(sqs).send(anyString(), anyString());
        assertThat(event.getStatus()).isEqualTo(OutboxStatus.PUBLISHED);
        assertThat(event.getPublishedAt()).isNotNull();
        assertThat(event.getLastError()).isNull();
    }

    @Test
    void transientFailureBacksOffAndRemainsPending() {
        EventOutboxRepository repository = mock(EventOutboxRepository.class);
        SqsTemplate sqs = mock(SqsTemplate.class);
        EventOutbox event = event(0);
        LocalDateTime before = LocalDateTime.now();
        when(repository.claimBatch(100)).thenReturn(List.of(event));
        doThrow(new RuntimeException("SQS unavailable"))
                .when(sqs).send(anyString(), anyString());

        new OutboxRelay(repository, sqs, new ObjectMapper()).drain();

        assertThat(event.getStatus()).isEqualTo(OutboxStatus.PENDING);
        assertThat(event.getAttempts()).isEqualTo(1);
        assertThat(event.getLastError()).contains("SQS unavailable");
        assertThat(event.getNextAttemptAt()).isAfter(before);
    }

    @Test
    void tenthFailureIsRetainedAsFailedForOperationsToSee() {
        EventOutboxRepository repository = mock(EventOutboxRepository.class);
        SqsTemplate sqs = mock(SqsTemplate.class);
        EventOutbox event = event(9);
        when(repository.claimBatch(100)).thenReturn(List.of(event));
        doThrow(new RuntimeException("still unavailable"))
                .when(sqs).send(anyString(), anyString());

        new OutboxRelay(repository, sqs, new ObjectMapper()).drain();

        assertThat(event.getStatus()).isEqualTo(OutboxStatus.FAILED);
        assertThat(event.getAttempts()).isEqualTo(OutboxRelay.MAX_ATTEMPTS);
        assertThat(event.getLastError()).contains("still unavailable");
    }

    private EventOutbox event(int attempts) {
        return EventOutbox.builder()
                .id(UUID.randomUUID())
                .tenantId("tenant-test")
                .aggregateType("PaymentCompletedEvent")
                .aggregateId("batch-1")
                .eventType("PAYMENT_COMPLETED")
                .destination("queue-1")
                .payload("{\"amount\":100}")
                .status(OutboxStatus.PENDING)
                .attempts(attempts)
                .nextAttemptAt(LocalDateTime.now())
                .createdAt(LocalDateTime.now())
                .build();
    }
}
