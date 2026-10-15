package com.chitfund.notificationservice.outbox;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.jdbc.core.JdbcTemplate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class NotificationDeliveryOutboxReplayTest {

    @Test
    void requeuesOnlyFailedDeliveryAndRecordsReplayEvidence() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.update(anyString(), any(Object[].class))).thenReturn(1, 1, 1);
        var outbox = new NotificationDeliveryOutbox(jdbc);

        assertThat(outbox.replayFailed("delivery-1", "operator-1", "provider recovered"))
                .isTrue();

        ArgumentCaptor<String> statements = ArgumentCaptor.forClass(String.class);
        verify(jdbc, times(3)).update(statements.capture(), any(Object[].class));
        assertThat(statements.getAllValues().get(0))
                .contains("status='PENDING'", "status='FAILED'");
        assertThat(statements.getAllValues().get(1))
                .contains("UPDATE notifications", "status='FAILED'");
        assertThat(statements.getAllValues().get(2))
                .contains("notification_delivery_replay_audit", "event_id", "replayed_by");
    }

    @Test
    void alreadyPendingOrPublishedDeliveryCannotBeReplayedAgain() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.update(anyString(), any(Object[].class))).thenReturn(0);
        var outbox = new NotificationDeliveryOutbox(jdbc);

        assertThat(outbox.replayFailed("delivery-1", "operator-1", "retry"))
                .isFalse();
        verify(jdbc, times(1)).update(anyString(), any(Object[].class));
    }
}
