package com.chitfund.auditservice.kafka;

import com.chitfund.auditservice.repository.EventInboxRepository;
import com.chitfund.auditservice.service.AuditService;
import com.chitfund.auditservice.dto.AuditLogRequest;
import com.chitfund.common.event.AuditLogEvent;
import com.chitfund.common.event.PaymentCompletedEvent;
import com.chitfund.common.event.SqsEventEnvelope;
import com.chitfund.common.event.SqsQueues;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import org.mockito.ArgumentCaptor;

class AuditEventConsumerTest {

    @Test
    void offlinePaymentKeepsDeviceTimeSyncTimeAndIdempotencyContext() throws Exception {
        AuditService auditService = mock(AuditService.class);
        EventInboxRepository inbox = mock(EventInboxRepository.class);
        when(inbox.claimIfAbsent(any(), any(), any())).thenReturn(1);
        ObjectMapper mapper = new ObjectMapper().findAndRegisterModules();
        AuditEventConsumer consumer = new AuditEventConsumer(auditService, mapper, inbox);
        PaymentCompletedEvent event = new PaymentCompletedEvent(
                "batch-1", "chit-1", "member-1", new java.math.BigDecimal("1200.00"), "UPI",
                new java.math.BigDecimal("5000.00"), new java.math.BigDecimal("1200.00"),
                new java.math.BigDecimal("3800.00"), 1, 0, 3, 0,
                java.time.LocalDate.of(2026, 9, 27), "admin-1",
                java.time.Instant.parse("2026-09-27T05:00:00Z"),
                "offline-key-1", "OFFLINE_SYNC",
                java.time.Instant.parse("2026-09-27T07:00:00Z"), "tenant-1");

        consumer.onEvent(mapper.writeValueAsString(new SqsEventEnvelope(
                "55555555-5555-5555-5555-555555555555",
                SqsQueues.EVT_PAYMENT_COMPLETED,
                mapper.writeValueAsString(event))));

        ArgumentCaptor<AuditLogRequest> request = ArgumentCaptor.forClass(AuditLogRequest.class);
        verify(auditService).record(request.capture());
        org.assertj.core.api.Assertions.assertThat(request.getValue().source()).isEqualTo("OFFLINE_SYNC");
        org.assertj.core.api.Assertions.assertThat(request.getValue().idempotencyKey()).isEqualTo("offline-key-1");
        org.assertj.core.api.Assertions.assertThat(request.getValue().occurredAt())
                .isEqualTo("2026-09-27T05:00:00Z");
        org.assertj.core.api.Assertions.assertThat(request.getValue().originalOfflineAt())
                .isEqualTo("2026-09-27T05:00:00Z");
        org.assertj.core.api.Assertions.assertThat(request.getValue().synchronizedAt())
                .isEqualTo("2026-09-27T07:00:00Z");
        org.assertj.core.api.Assertions.assertThat(request.getValue().afterState())
                .contains("1200.00", "member-1", "UPI");
    }

    @Test
    void auditEnvelopeIdentityAndContextReachTheImmutableAuditRecord() throws Exception {
        AuditService auditService = mock(AuditService.class);
        EventInboxRepository inbox = mock(EventInboxRepository.class);
        when(inbox.claimIfAbsent(any(), any(), any())).thenReturn(1);
        ObjectMapper mapper = new ObjectMapper().findAndRegisterModules();
        AuditEventConsumer consumer = new AuditEventConsumer(auditService, mapper, inbox);
        AuditLogEvent event = new AuditLogEvent(
                "payment-service", "PAYMENT_BATCH", "batch-1", "chit-1",
                "PAYMENT_COMPLETED", "actor-1", "ADMIN", null,
                null, null, null, "tenant-1",
                "request-42", "payment-key-7", "MOBILE", "SUCCESS", null,
                null, null, "device-hash", java.time.Instant.parse("2026-09-27T12:00:00Z"),
                java.time.Instant.parse("2026-09-27T11:59:00Z"),
                java.time.Instant.parse("2026-09-27T12:00:05Z"));
        String eventId = "22222222-2222-2222-2222-222222222222";

        consumer.onEvent(mapper.writeValueAsString(new SqsEventEnvelope(
                eventId, SqsQueues.EVT_AUDIT_LOG, mapper.writeValueAsString(event))));

        ArgumentCaptor<AuditLogRequest> request = ArgumentCaptor.forClass(AuditLogRequest.class);
        verify(auditService).record(request.capture());
        org.assertj.core.api.Assertions.assertThat(request.getValue().eventId()).isEqualTo(eventId);
        org.assertj.core.api.Assertions.assertThat(request.getValue().correlationId()).isEqualTo("request-42");
        org.assertj.core.api.Assertions.assertThat(request.getValue().source()).isEqualTo("MOBILE");
        org.assertj.core.api.Assertions.assertThat(request.getValue().originalOfflineAt())
                .isEqualTo("2026-09-27T11:59:00Z");
    }

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
    void unknownEventTypeFailsSoSqsCanRetryOrDeadLetterIt() {
        EventInboxRepository inbox = mock(EventInboxRepository.class);
        when(inbox.claimIfAbsent(any(), any(), any())).thenReturn(1);
        AuditEventConsumer consumer = new AuditEventConsumer(
                mock(AuditService.class), new ObjectMapper(), inbox);

        assertThatThrownBy(() -> consumer.onEvent("""
                {"eventId":"11111111-1111-1111-1111-111111111111",
                 "eventType":"FUTURE_UNKNOWN_EVENT","payload":"{}"}
                """))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("processing failed")
                .hasRootCauseMessage("Unhandled audit event type: FUTURE_UNKNOWN_EVENT");
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
                {"eventId":"not-a-uuid","eventType":"AUDIT_LOG","payload":"{}"}
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
        AuditLogEvent event = new AuditLogEvent(
                "test-service", "PAYMENT", "entity-id", "chit-id",
                "TEST_ACTION", "actor-id", "ADMIN", null,
                null, null, null, "tenant");
        String raw = mapper.writeValueAsString(new SqsEventEnvelope(
                "44444444-4444-4444-4444-444444444444",
                SqsQueues.EVT_AUDIT_LOG,
                mapper.writeValueAsString(event)));

        assertThatThrownBy(() -> consumer.onEvent(raw))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("processing failed");
        verify(auditService).record(any());
    }
}
