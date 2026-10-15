package com.chitfund.common.outbox;

import org.junit.jupiter.api.Test;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.test.context.runner.WebApplicationContextRunner;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

class OutboxOperationsAutoConfigurationTest {

    private final WebApplicationContextRunner contextRunner = new WebApplicationContextRunner()
            .withConfiguration(AutoConfigurations.of(OutboxOperationsAutoConfiguration.class))
            .withPropertyValues("app.internal-key=test-internal-key");

    @Test
    void createsReplayControllerWhenBothOutboxStoresExist() {
        contextRunner
                .withBean(DurableAuditOutbox.class, () -> mock(DurableAuditOutbox.class))
                .withBean(DurableEventOutbox.class, () -> mock(DurableEventOutbox.class))
                .run(context -> assertThat(context)
                        .hasSingleBean(InternalOutboxReplayController.class));
    }

    @Test
    void doesNotCreateReplayControllerForServicesWithoutBothOutboxes() {
        contextRunner
                .withBean(DurableAuditOutbox.class, () -> mock(DurableAuditOutbox.class))
                .run(context -> assertThat(context)
                        .doesNotHaveBean(InternalOutboxReplayController.class));
    }
}
