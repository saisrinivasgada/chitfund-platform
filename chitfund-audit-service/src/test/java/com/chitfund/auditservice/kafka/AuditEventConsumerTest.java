package com.chitfund.auditservice.kafka;

import com.chitfund.auditservice.repository.EventInboxRepository;
import com.chitfund.auditservice.service.AuditService;
import com.chitfund.common.event.SqsEventEnvelope;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class AuditEventConsumerTest {

    @Test
    void malformedMessageFailsSoSqsCanRetryIt() {
        AuditEventConsumer consumer = new AuditEventConsumer(
                mock(AuditService.class), new ObjectMapper(), mock(EventInboxRepository.class));

        assertThatThrownBy(() -> consumer.onEvent("not-json"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("processing failed");
    }

    @Test
    void duplicateEventIdIsAcknowledgedWithoutWritingAnotherAuditLog() throws Exception {
        AuditService audit = mock(AuditService.class);
        EventInboxRepository inbox = mock(EventInboxRepository.class);
        ObjectMapper mapper = new ObjectMapper();
        when(inbox.existsById("event-1")).thenReturn(true);
        AuditEventConsumer consumer = new AuditEventConsumer(audit, mapper, inbox);
        String raw = mapper.writeValueAsString(
                new SqsEventEnvelope("event-1", "PAYMENT_COMPLETED", "{}"));

        consumer.onEvent(raw);

        verifyNoInteractions(audit);
    }
}
