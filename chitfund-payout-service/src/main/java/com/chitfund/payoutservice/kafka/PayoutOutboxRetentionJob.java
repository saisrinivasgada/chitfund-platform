package com.chitfund.payoutservice.kafka;

import com.chitfund.payoutservice.config.EventDeliveryProperties;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.time.ZoneOffset;

@Component
@RequiredArgsConstructor
@Slf4j
public class PayoutOutboxRetentionJob {

    private final PayoutOutboxStore store;
    private final EventDeliveryProperties properties;

    @Scheduled(cron = "${chitwise.events.retention-cron:0 23 3 * * *}", zone = "UTC")
    public void prune() {
        if (!properties.isRetentionEnabled()) return;
        LocalDateTime cutoff = LocalDateTime.now(ZoneOffset.UTC)
                .minusDays(properties.getRetentionDays());
        int deleted = store.deletePublishedBefore(cutoff, properties.getRetentionBatchSize());
        if (deleted > 0) log.info("Deleted {} expired published payout outbox deliveries", deleted);
    }
}
