package com.chitfund.reportingservice.kafka;

import com.chitfund.reportingservice.service.ReportIngestService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;

class ReportingEventConsumerTest {

    @Test
    void malformedMessageFailsSoSqsCanRetryIt() {
        ReportingEventConsumer consumer = new ReportingEventConsumer(
                mock(ReportIngestService.class), new ObjectMapper());

        assertThatThrownBy(() -> consumer.onEvent("not-json"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("processing failed");
    }
}
