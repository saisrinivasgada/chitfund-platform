package com.chitfund.reportingservice.kafka;

import com.chitfund.reportingservice.service.ReportIngestService;
import com.chitfund.reportingservice.repository.EventInboxRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ReportingEventConsumerTest {

    @Test
    void malformedMessageFailsSoSqsCanRetryIt() {
        ReportingEventConsumer consumer = new ReportingEventConsumer(
                mock(ReportIngestService.class), new ObjectMapper(),
                mock(EventInboxRepository.class));

        assertThatThrownBy(() -> consumer.onEvent("not-json"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("processing failed");
    }

    @Test
    void duplicateEventIsAcknowledgedWithoutRepeatingTheSideEffect() {
        ReportIngestService ingest = mock(ReportIngestService.class);
        EventInboxRepository inbox = mock(EventInboxRepository.class);
        when(inbox.claimIfAbsent(eq("11111111-1111-1111-1111-111111111111"),
                eq("PAYMENT_COMPLETED"), any())).thenReturn(0);
        ReportingEventConsumer consumer = new ReportingEventConsumer(
                ingest, new ObjectMapper(), inbox);

        consumer.onEvent("""
                {"eventId":"11111111-1111-1111-1111-111111111111",
                 "eventType":"PAYMENT_COMPLETED","payload":"{}"}
                """);

        verify(ingest, never()).ingestMemberPayment(any());
    }

    @Test
    void legacyEnvelopeWithoutEventIdRemainsCompatible() {
        EventInboxRepository inbox = mock(EventInboxRepository.class);
        ReportingEventConsumer consumer = new ReportingEventConsumer(
                mock(ReportIngestService.class), new ObjectMapper(), inbox);

        consumer.onEvent("{\"eventType\":\"LEGACY_UNKNOWN\",\"payload\":\"{}\"}");

        verify(inbox, never()).claimIfAbsent(any(), any(), any());
    }
}
