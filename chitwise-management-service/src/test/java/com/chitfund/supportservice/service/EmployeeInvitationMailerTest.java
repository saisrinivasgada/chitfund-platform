package com.chitfund.supportservice.service;

import com.chitfund.common.event.SqsQueues;
import com.chitfund.common.outbox.DurableEventOutbox;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

class EmployeeInvitationMailerTest {
    private DurableEventOutbox outbox;
    private EmployeeInvitationMailer mailer;

    @BeforeEach
    void setUp() {
        outbox = mock(DurableEventOutbox.class);
        mailer = new EmployeeInvitationMailer(outbox, new ObjectMapper());
        ReflectionTestUtils.setField(mailer, "hubUrl", "https://hub.example.test");
    }

    @Test
    void invitationIsPersistedForDurableEmailDelivery() {
        var payload = org.mockito.ArgumentCaptor.forClass(String.class);

        mailer.sendInvitation("employee@example.test", "Employee", "one-time-token");

        verify(outbox).enqueue(anyString(),
                org.mockito.ArgumentMatchers.eq(SqsQueues.EVT_TRANSACTIONAL_EMAIL),
                payload.capture(), org.mockito.ArgumentMatchers.eq(SqsQueues.NOTIFICATION_EVENTS));
        assertThat(payload.getValue()).contains("employee@example.test")
                .contains("accept-invite?token=one-time-token");
    }

    @Test
    void outboxFailureStopsInvitationTransaction() {
        doThrow(new IllegalStateException("database unavailable"))
                .when(outbox).enqueue(anyString(), anyString(), anyString(), anyString());

        assertThatThrownBy(() -> mailer.sendInvitation(
                "employee@example.test", "Employee", "one-time-token"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("persist invitation");
    }
}
