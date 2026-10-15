package com.chitfund.common.outbox;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.parallel.ResourceLock;
import org.springframework.jdbc.core.JdbcTemplate;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.Arrays;
import java.util.TimeZone;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;

class OutboxTimestampTest {

    @Test
    @ResourceLock("default-time-zone")
    void enqueueTimestampsRepresentCurrentInstantOutsideUtcJvm() {
        TimeZone original = TimeZone.getDefault();
        TimeZone.setDefault(TimeZone.getTimeZone("America/Los_Angeles"));
        try {
            JdbcTemplate jdbc = mock(JdbcTemplate.class);
            AtomicReference<Object[]> parameters = new AtomicReference<>();
            doAnswer(invocation -> {
                parameters.set(Arrays.copyOfRange(
                        invocation.getArguments(), 1, invocation.getArguments().length));
                return 1;
            }).when(jdbc).update(anyString(), any(Object[].class));

            Instant before = Instant.now().minusSeconds(1);
            new DurableEventOutbox(jdbc).enqueue(
                    "event-id", "TEST_EVENT", "{}", "test-queue");
            Instant after = Instant.now().plusSeconds(1);

            Object[] values = parameters.get();
            assertThat(values).isNotNull();
            assertCurrentInstant(values[5], before, after);
            assertCurrentInstant(values[6], before, after);
        } finally {
            TimeZone.setDefault(original);
        }
    }

    @Test
    @ResourceLock("default-time-zone")
    void auditEnqueueTimestampsRepresentCurrentInstantOutsideUtcJvm() {
        TimeZone original = TimeZone.getDefault();
        TimeZone.setDefault(TimeZone.getTimeZone("America/Los_Angeles"));
        try {
            JdbcTemplate jdbc = mock(JdbcTemplate.class);
            AtomicReference<Object[]> parameters = new AtomicReference<>();
            doAnswer(invocation -> {
                parameters.set(Arrays.copyOfRange(
                        invocation.getArguments(), 1, invocation.getArguments().length));
                return 1;
            }).when(jdbc).update(anyString(), any(Object[].class));

            Instant before = Instant.now().minusSeconds(1);
            new DurableAuditOutbox(jdbc).enqueue(
                    "event-id", "tenant-id", "MEMBER", "member-id", "{}", "audit-queue");
            Instant after = Instant.now().plusSeconds(1);

            Object[] values = parameters.get();
            assertThat(values).isNotNull();
            assertCurrentInstant(values[7], before, after);
            assertCurrentInstant(values[8], before, after);
        } finally {
            TimeZone.setDefault(original);
        }
    }

    private static void assertCurrentInstant(Object value, Instant before, Instant after) {
        assertThat(value).isInstanceOf(Timestamp.class);
        assertThat(((Timestamp) value).toInstant()).isBetween(before, after);
    }
}
