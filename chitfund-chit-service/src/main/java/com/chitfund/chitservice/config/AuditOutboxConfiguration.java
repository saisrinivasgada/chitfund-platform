package com.chitfund.chitservice.config;

import com.chitfund.common.outbox.DurableAuditOutbox;
import com.chitfund.common.outbox.DurableAuditOutboxRelay;
import com.chitfund.common.outbox.DurableEventOutbox;
import com.chitfund.common.outbox.DurableEventOutboxRelay;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.awspring.cloud.sqs.operations.SqsTemplate;
import io.micrometer.core.instrument.MeterRegistry;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;

import java.time.Duration;

@Configuration
public class AuditOutboxConfiguration {

    @Bean
    DurableAuditOutbox durableAuditOutbox(JdbcTemplate jdbcTemplate) {
        return new DurableAuditOutbox(jdbcTemplate);
    }

    @Bean
    DurableAuditOutboxRelay durableAuditOutboxRelay(
            DurableAuditOutbox store, SqsTemplate sqsTemplate, ObjectMapper objectMapper,
            MeterRegistry meterRegistry,
            @Value("${chitwise.audit-outbox.batch-size:100}") int batchSize,
            @Value("${chitwise.audit-outbox.max-attempts:10}") int maxAttempts,
            @Value("${chitwise.audit-outbox.lease-duration:PT30S}") Duration leaseDuration) {
        return new DurableAuditOutboxRelay(store, sqsTemplate, objectMapper, meterRegistry,
                "chit-service", batchSize, maxAttempts, leaseDuration);
    }

    @Bean
    DurableEventOutbox durableEventOutbox(JdbcTemplate jdbcTemplate) {
        return new DurableEventOutbox(jdbcTemplate);
    }

    @Bean
    DurableEventOutboxRelay durableEventOutboxRelay(
            DurableEventOutbox store, SqsTemplate sqsTemplate, ObjectMapper objectMapper,
            MeterRegistry meterRegistry,
            @Value("${chitwise.event-outbox.batch-size:100}") int batchSize,
            @Value("${chitwise.event-outbox.max-attempts:10}") int maxAttempts,
            @Value("${chitwise.event-outbox.lease-duration:PT30S}") Duration leaseDuration) {
        return new DurableEventOutboxRelay(store, sqsTemplate, objectMapper, meterRegistry,
                "chit-service", batchSize, maxAttempts, leaseDuration);
    }
}
