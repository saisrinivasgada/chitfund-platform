package com.chitfund.common.outbox;

import com.chitfund.common.event.SqsEventEnvelope;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.awspring.cloud.sqs.operations.SqsTemplate;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;

import java.time.Duration;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.concurrent.atomic.AtomicLong;
import java.util.regex.Pattern;

@Slf4j
public class DurableEventOutboxRelay {

    private static final Pattern SECRET = Pattern.compile(
            "(?i)(authorization|password|secret|token|api[-_]?key)\\s*[:=]\\s*[^,;\\s]+"
    );

    private final DurableEventOutbox store;
    private final SqsTemplate sqsTemplate;
    private final ObjectMapper objectMapper;
    private final String serviceName;
    private final int batchSize;
    private final int maxAttempts;
    private final Duration leaseDuration;
    private final Counter published;
    private final Counter retried;
    private final Counter failed;
    private final Counter staleFinalizations;
    private final AtomicLong pendingGauge = new AtomicLong();
    private final AtomicLong failedGauge = new AtomicLong();
    private final AtomicLong oldestGauge = new AtomicLong();

    public DurableEventOutboxRelay(DurableEventOutbox store, SqsTemplate sqsTemplate,
                                   ObjectMapper objectMapper, MeterRegistry meterRegistry,
                                   String serviceName, int batchSize, int maxAttempts,
                                   Duration leaseDuration) {
        this.store = store;
        this.sqsTemplate = sqsTemplate;
        this.objectMapper = objectMapper;
        this.serviceName = serviceName;
        this.batchSize = Math.max(1, Math.min(batchSize, 500));
        this.maxAttempts = Math.max(1, maxAttempts);
        this.leaseDuration = leaseDuration.isNegative() || leaseDuration.isZero()
                ? Duration.ofSeconds(30) : leaseDuration;
        this.published = meterRegistry.counter("chitwise.event.outbox.published", "service", serviceName);
        this.retried = meterRegistry.counter("chitwise.event.outbox.retried", "service", serviceName);
        this.failed = meterRegistry.counter("chitwise.event.outbox.failed", "service", serviceName);
        this.staleFinalizations = meterRegistry.counter(
                "chitwise.event.outbox.stale_finalize", "service", serviceName);
        Gauge.builder("chitwise.event.outbox.pending", pendingGauge, AtomicLong::get)
                .tag("service", serviceName).register(meterRegistry);
        Gauge.builder("chitwise.event.outbox.failed.current", failedGauge, AtomicLong::get)
                .tag("service", serviceName).register(meterRegistry);
        Gauge.builder("chitwise.event.outbox.oldest.unpublished.seconds", oldestGauge, AtomicLong::get)
                .tag("service", serviceName).register(meterRegistry);
    }

    @Scheduled(fixedDelayString = "${chitwise.event-outbox.relay-delay-ms:2000}")
    public void drain() {
        try {
            for (EventOutboxDelivery delivery : store.claimBatch(batchSize, leaseDuration)) {
                publishOne(delivery);
            }
        } finally {
            refreshMetrics();
        }
    }

    void publishOne(EventOutboxDelivery delivery) {
        try {
            String envelope = objectMapper.writeValueAsString(new SqsEventEnvelope(
                    delivery.eventId(), delivery.eventType(), delivery.payload()));
            // Network I/O is deliberately outside the short database claim transaction.
            sqsTemplate.send(delivery.destination(), envelope);
            if (store.markPublished(delivery)) published.increment();
            else staleFinalizations.increment();
        } catch (Exception exception) {
            int exponent = Math.min(delivery.attempts(), 8);
            long delaySeconds = Math.min(300, 1L << exponent);
            var result = store.markFailed(delivery, maxAttempts,
                    LocalDateTime.now(ZoneOffset.UTC).plusSeconds(delaySeconds),
                    exception.getClass().getSimpleName(), sanitize(exception.getMessage()));
            if (!result.updated()) {
                staleFinalizations.increment();
            } else if (result.terminal()) {
                failed.increment();
                log.error("EVENT_DELIVERY_FAILURE: {} delivery {} permanently failed after {} attempts",
                        serviceName, delivery.deliveryId(), result.attempts());
            } else {
                retried.increment();
                log.warn("{} event delivery {} failed; retry {} scheduled in {}s",
                        serviceName, delivery.deliveryId(), result.attempts(), delaySeconds);
            }
        }
    }

    private void refreshMetrics() {
        try {
            pendingGauge.set(store.countByStatus("PENDING") + store.countByStatus("IN_FLIGHT"));
            failedGauge.set(store.countByStatus("FAILED"));
            oldestGauge.set(store.oldestUnpublishedAgeSeconds());
        } catch (Exception exception) {
            log.warn("Could not refresh {} event outbox metrics: {}",
                    serviceName, sanitize(exception.getMessage()));
        }
    }

    static String sanitize(String message) {
        if (message == null || message.isBlank()) return "No error message";
        String sanitized = SECRET.matcher(message).replaceAll("$1=[REDACTED]")
                .replaceAll("[\\r\\n]+", " ").trim();
        return sanitized.substring(0, Math.min(sanitized.length(), 2000));
    }
}
