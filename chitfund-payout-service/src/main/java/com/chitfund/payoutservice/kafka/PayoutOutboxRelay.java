package com.chitfund.payoutservice.kafka;

import com.chitfund.common.event.SqsEventEnvelope;
import com.chitfund.payoutservice.config.EventDeliveryProperties;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.awspring.cloud.sqs.operations.SqsTemplate;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.concurrent.atomic.AtomicLong;
import java.util.regex.Pattern;

@Component
@Slf4j
public class PayoutOutboxRelay {

    private static final Pattern SECRET = Pattern.compile(
            "(?i)(authorization|password|secret|token|api[-_]?key)\\s*[:=]\\s*[^,;\\s]+");

    private final PayoutOutboxStore store;
    private final SqsTemplate sqsTemplate;
    private final ObjectMapper objectMapper;
    private final EventDeliveryProperties properties;
    private final Counter published;
    private final Counter retried;
    private final Counter failed;
    private final Counter staleFinalizations;
    private final AtomicLong pendingGauge = new AtomicLong();
    private final AtomicLong failedGauge = new AtomicLong();
    private final AtomicLong oldestUnpublishedSecondsGauge = new AtomicLong();

    public PayoutOutboxRelay(PayoutOutboxStore store, SqsTemplate sqsTemplate,
                             ObjectMapper objectMapper, EventDeliveryProperties properties,
                             MeterRegistry meterRegistry) {
        this.store = store;
        this.sqsTemplate = sqsTemplate;
        this.objectMapper = objectMapper;
        this.properties = properties;
        this.published = meterRegistry.counter("chitwise.outbox.published", "service", "payout");
        this.retried = meterRegistry.counter("chitwise.outbox.retried", "service", "payout");
        this.failed = meterRegistry.counter("chitwise.outbox.failed", "service", "payout");
        this.staleFinalizations = meterRegistry.counter(
                "chitwise.outbox.stale_finalize", "service", "payout");
        Gauge.builder("chitwise.outbox.pending", pendingGauge, AtomicLong::get)
                .tag("service", "payout").register(meterRegistry);
        Gauge.builder("chitwise.outbox.failed.current", failedGauge, AtomicLong::get)
                .tag("service", "payout").register(meterRegistry);
        Gauge.builder("chitwise.outbox.oldest.unpublished.seconds",
                        oldestUnpublishedSecondsGauge, AtomicLong::get)
                .tag("service", "payout").register(meterRegistry);
    }

    @Scheduled(fixedDelayString = "${chitwise.events.relay-delay-ms:2000}")
    public void drain() {
        if (!properties.isRelayEnabled() || !properties.getMode().writesOutbox()) return;
        try {
            for (OutboxDelivery delivery : store.claimBatch(
                    properties.getBatchSize(), properties.getLeaseDuration())) {
                publishOne(delivery);
            }
        } finally {
            refreshMetrics();
        }
    }

    void publishOne(OutboxDelivery delivery) {
        try {
            String envelope = objectMapper.writeValueAsString(new SqsEventEnvelope(
                    delivery.eventId(), delivery.eventType(), delivery.payload()));
            sqsTemplate.send(delivery.destination(), envelope);
            if (store.markPublished(delivery)) published.increment();
            else staleFinalizations.increment();
        } catch (Exception exception) {
            long delaySeconds = Math.min(300, 1L << Math.min(delivery.attempts(), 8));
            var result = store.markFailed(
                    delivery, Math.max(1, properties.getMaxAttempts()),
                    LocalDateTime.now(ZoneOffset.UTC).plusSeconds(delaySeconds),
                    exception.getClass().getSimpleName(), sanitize(exception.getMessage()));
            if (!result.updated()) staleFinalizations.increment();
            else if (result.terminal()) {
                failed.increment();
                log.error("Payout outbox delivery {} permanently failed after {} attempts",
                        delivery.deliveryId(), result.attempts());
            } else retried.increment();
        }
    }

    private void refreshMetrics() {
        try {
            pendingGauge.set(store.countByStatus("PENDING") + store.countByStatus("IN_FLIGHT"));
            failedGauge.set(store.countByStatus("FAILED"));
            oldestUnpublishedSecondsGauge.set(store.oldestUnpublishedAgeSeconds());
        } catch (Exception exception) {
            log.warn("Could not refresh payout outbox metrics: {}", sanitize(exception.getMessage()));
        }
    }

    static String sanitize(String message) {
        if (message == null || message.isBlank()) return "No error message";
        String sanitized = SECRET.matcher(message).replaceAll("$1=[REDACTED]")
                .replaceAll("[\\r\\n]+", " ").trim();
        return sanitized.substring(0, Math.min(sanitized.length(), 2000));
    }
}
