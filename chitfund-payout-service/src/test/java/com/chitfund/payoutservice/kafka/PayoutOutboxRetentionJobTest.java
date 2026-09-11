package com.chitfund.payoutservice.kafka;

import com.chitfund.payoutservice.config.EventDeliveryProperties;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

class PayoutOutboxRetentionJobTest {

    @Test
    void retentionIsDisabledByDefault() {
        PayoutOutboxStore store = mock(PayoutOutboxStore.class);
        new PayoutOutboxRetentionJob(store, new EventDeliveryProperties()).prune();
        verify(store, never()).deletePublishedBefore(any(LocalDateTime.class), anyInt());
    }

    @Test
    void enabledRetentionUsesConfiguredWindowAndBatch() {
        PayoutOutboxStore store = mock(PayoutOutboxStore.class);
        EventDeliveryProperties properties = new EventDeliveryProperties();
        properties.setRetentionEnabled(true);
        properties.setRetentionDays(120);
        properties.setRetentionBatchSize(321);
        new PayoutOutboxRetentionJob(store, properties).prune();
        verify(store).deletePublishedBefore(any(LocalDateTime.class), eq(321));
    }
}
