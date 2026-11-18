package com.chitfund.common.event;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class SqsQueuesTest {

    @Test
    void productionDefaultsRemainUnprefixed() {
        assertThat(SqsQueues.prefixed("", SqsQueues.AUDIT_EVENTS))
                .isEqualTo("chitfund-audit-events");
    }

    @Test
    void stagingPrefixIsAppliedToEveryConsolidatedQueue() {
        assertThat(SqsQueues.prefixed("staging-", SqsQueues.AUDIT_EVENTS))
                .isEqualTo("staging-chitfund-audit-events");
        assertThat(SqsQueues.prefixed("staging-", SqsQueues.NOTIFICATION_EVENTS))
                .isEqualTo("staging-chitfund-notification-events");
        assertThat(SqsQueues.prefixed("staging-", SqsQueues.REPORTING_EVENTS))
                .isEqualTo("staging-chitfund-reporting-events");
    }

    @Test
    void listenerNamesAreResolvedBySpringAtRuntime() {
        assertThat(SqsQueues.AUDIT_EVENTS_LISTENER)
                .isEqualTo("${SQS_QUEUE_PREFIX:}chitfund-audit-events");
    }

    @Test
    void unsafePrefixIsRejected() {
        assertThatThrownBy(() -> SqsQueues.validatePrefix("https://example.com/"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("letters, digits, hyphens or underscores");
    }

    @Test
    void overlongPrefixIsRejected() {
        assertThatThrownBy(() -> SqsQueues.validatePrefix("a".repeat(41)))
                .isInstanceOf(IllegalStateException.class);
    }
}
