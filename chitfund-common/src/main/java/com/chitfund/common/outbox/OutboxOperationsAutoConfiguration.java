package com.chitfund.common.outbox;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.context.annotation.Bean;

@AutoConfiguration
@ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
@ConditionalOnBean({DurableAuditOutbox.class, DurableEventOutbox.class})
public class OutboxOperationsAutoConfiguration {

    @Bean
    InternalOutboxReplayController internalOutboxReplayController(
            DurableAuditOutbox auditOutbox,
            DurableEventOutbox eventOutbox,
            @Value("${app.internal-key}") String internalKey) {
        return new InternalOutboxReplayController(auditOutbox, eventOutbox, internalKey);
    }
}
