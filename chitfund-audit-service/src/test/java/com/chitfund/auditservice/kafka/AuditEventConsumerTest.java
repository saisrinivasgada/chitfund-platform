package com.chitfund.auditservice.kafka;

import com.chitfund.auditservice.repository.EventInboxRepository;
import com.chitfund.auditservice.service.AuditService;
import com.chitfund.common.event.PaymentCompletedEvent;
import com.chitfund.common.event.SqsEventEnvelope;
import com.chitfund.common.event.SqsQueues;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class AuditEventConsumerTest {

    @Test
    void malformedMessageFailsSoSqsCanRetryIt() {
        AuditEventConsumer consumer = new AuditEventConsumer(
                mock(AuditService.class), new ObjectMapper(),
                mock(EventInboxRepository.class));

        assertThatThrownBy(() -> consumer.onEvent("not-json"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("processing failed");
    }

    @Test
    void duplicateEventDoesNotCreateAnotherAuditRecord() {
        AuditService auditService = mock(AuditService.class);
        EventInboxRepository inbox = mock(EventInboxRepository.class);
        when(inbox.claimIfAbsent(eq("33333333-3333-3333-3333-333333333333"),
                eq("PAYMENT_COMPLETED"), any())).thenReturn(0);
        AuditEventConsumer consumer = new AuditEventConsumer(
                auditService, new ObjectMapper().findAndRegisterModules(), inbox);

        consumer.onEvent("""
                {"eventId":"33333333-3333-3333-3333-333333333333",
                 "eventType":"PAYMENT_COMPLETED","payload":"{}"}
                """);

        verify(auditService, never()).record(any());
    }

    @Test
    void nonCanonicalEventIdFailsInsteadOfBeingSilentlyTruncated() {
        EventInboxRepository inbox = mock(EventInboxRepository.class);
        AuditEventConsumer consumer = new AuditEventConsumer(
                mock(AuditService.class), new ObjectMapper(), inbox);

        assertThatThrownBy(() -> consumer.onEvent("""
                {"eventId":"not-a-uuid","eventType":"PAYMENT_COMPLETED","payload":"{}"}
                """))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("processing failed");
        verify(inbox, never()).claimIfAbsent(any(), any(), any());
    }

    @Test
    void handlerFailureIsPropagatedForQueueRetry() throws Exception {
        AuditService auditService = mock(AuditService.class);
        EventInboxRepository inbox = mock(EventInboxRepository.class);
        when(inbox.claimIfAbsent(any(), any(), any())).thenReturn(1);
        org.mockito.Mockito.doThrow(new IllegalStateException("database unavailable"))
                .when(auditService).record(any());
        ObjectMapper mapper = new ObjectMapper().findAndRegisterModules();
        AuditEventConsumer consumer = new AuditEventConsumer(auditService, mapper, inbox);
        PaymentCompletedEvent event = new PaymentCompletedEvent(
                "batch", "chit", "member", BigDecimal.ONE, "UPI",
                BigDecimal.ONE, BigDecimal.ONE, BigDecimal.ZERO,
                1, 0, 0, 0, LocalDate.of(2026, 9, 10),
                "admin", Instant.parse("2026-09-10T00:00:00Z"), "tenant");
        String raw = mapper.writeValueAsString(new SqsEventEnvelope(
                "44444444-4444-4444-4444-444444444444",
                SqsQueues.EVT_PAYMENT_COMPLETED,
                mapper.writeValueAsString(event)));

        assertThatThrownBy(() -> consumer.onEvent(raw))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("processing failed");
        verify(auditService).record(any());
    }
}
