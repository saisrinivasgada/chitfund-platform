package com.chitfund.payoutservice.kafka;

import com.chitfund.common.event.SqsEventEnvelope;
import com.chitfund.payoutservice.config.EventDeliveryProperties;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.awspring.cloud.sqs.operations.SqsTemplate;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.time.Duration;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class PayoutOutboxRelayTest {

    @Test
    void publishesClaimedEventAndFinalizesItsLease() throws Exception {
        PayoutOutboxStore store = mock(PayoutOutboxStore.class);
        SqsTemplate sqs = mock(SqsTemplate.class);
        EventDeliveryProperties properties = new EventDeliveryProperties();
        properties.setMode(EventDeliveryProperties.Mode.OUTBOX);
        properties.setLeaseDuration(Duration.ofSeconds(20));
        OutboxDelivery delivery = new OutboxDelivery(
                "delivery", "11111111-1111-1111-1111-111111111111",
                "PAYOUT_CREATED", "queue", "{\"amount\":900}", 0, "lease");
        when(store.claimBatch(100, Duration.ofSeconds(20))).thenReturn(List.of(delivery));
        when(store.markPublished(delivery)).thenReturn(true);
        ObjectMapper mapper = new ObjectMapper();
        PayoutOutboxRelay relay = new PayoutOutboxRelay(
                store, sqs, mapper, properties, new SimpleMeterRegistry());

        relay.drain();

        ArgumentCaptor<String> raw = ArgumentCaptor.forClass(String.class);
        verify(sqs).send(eq("queue"), raw.capture());
        assertThat(mapper.readValue(raw.getValue(), SqsEventEnvelope.class).eventId())
                .isEqualTo(delivery.eventId());
        verify(store).markPublished(delivery);
    }

    @Test
    void sanitizesSecretsBeforePersistence() {
        assertThat(PayoutOutboxRelay.sanitize("Authorization=top-secret\nfailed"))
                .isEqualTo("Authorization=[REDACTED] failed");
    }
}
