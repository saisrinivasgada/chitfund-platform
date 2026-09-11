package com.chitfund.paymentservice.kafka;

import com.chitfund.common.event.SqsEventEnvelope;
import com.chitfund.paymentservice.config.EventDeliveryProperties;
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
public class PaymentOutboxRelay {

    private static final Pattern SECRET = Pattern.compile(
            "(?i)(authorization|password|secret|token|api[-_]?key)\\s*[:=]\\s*[^,;\\s]+"
    );

    private final PaymentOutboxStore store;
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

    public PaymentOutboxRelay(PaymentOutboxStore store, SqsTemplate sqsTemplate,
                              ObjectMapper objectMapper, EventDeliveryProperties properties,
                              MeterRegistry meterRegistry) {
        this.store = store;
        this.sqsTemplate = sqsTemplate;
        this.objectMapper = objectMapper;
        this.properties = properties;
        this.published = meterRegistry.counter("chitwise.outbox.published", "service", "payment");
        this.retried = meterRegistry.counter("chitwise.outbox.retried", "service", "payment");
        this.failed = meterRegistry.counter("chitwise.outbox.failed", "service", "payment");
        this.staleFinalizations = meterRegistry.counter(
                "chitwise.outbox.stale_finalize", "service", "payment");
        Gauge.builder("chitwise.outbox.pending", pendingGauge, AtomicLong::get)
                .description("Payment outbox deliveries waiting or currently leased")
                .tag("service", "payment")
                .register(meterRegistry);
        Gauge.builder("chitwise.outbox.failed.current", failedGauge, AtomicLong::get)
                .description("Payment outbox deliveries requiring operator replay")
                .tag("service", "payment")
                .register(meterRegistry);
        Gauge.builder("chitwise.outbox.oldest.unpublished.seconds",
                        oldestUnpublishedSecondsGauge, AtomicLong::get)
                .description("Age in seconds of the oldest pending or leased delivery")
                .tag("service", "payment")
                .register(meterRegistry);
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
            refreshOperationalMetrics();
        }
    }

    private void refreshOperationalMetrics() {
        try {
            pendingGauge.set(store.countByStatus("PENDING") + store.countByStatus("IN_FLIGHT"));
            failedGauge.set(store.countByStatus("FAILED"));
            oldestUnpublishedSecondsGauge.set(store.oldestUnpublishedAgeSeconds());
        } catch (Exception exception) {
            log.warn("Could not refresh payment outbox operational metrics: {}",
                    sanitize(exception.getMessage()));
        }
    }

    void publishOne(OutboxDelivery delivery) {
        try {
            String envelope = objectMapper.writeValueAsString(new SqsEventEnvelope(
                    delivery.eventId(), delivery.eventType(), delivery.payload()));
            // Deliberately outside PaymentOutboxStore's short claim transaction.
            sqsTemplate.send(delivery.destination(), envelope);
            if (store.markPublished(delivery)) {
                published.increment();
            } else {
                staleFinalizations.increment();
                log.warn("Outbox delivery {} was reclaimed before success could be finalized",
                        delivery.deliveryId());
            }
        } catch (Exception exception) {
            int exponent = Math.min(delivery.attempts(), 8);
            long delaySeconds = Math.min(300, 1L << exponent);
            var result = store.markFailed(
                    delivery, Math.max(1, properties.getMaxAttempts()),
                    LocalDateTime.now(ZoneOffset.UTC).plusSeconds(delaySeconds),
                    exception.getClass().getSimpleName(), sanitize(exception.getMessage()));
            if (!result.updated()) {
                staleFinalizations.increment();
            } else if (result.terminal()) {
                failed.increment();
                log.error("Outbox delivery {} permanently failed after {} attempts; replay is required",
                        delivery.deliveryId(), result.attempts());
            } else {
                retried.increment();
                log.warn("Outbox delivery {} failed; retry {} scheduled in {}s",
                        delivery.deliveryId(), result.attempts(), delaySeconds);
            }
        }
    }

    static String sanitize(String message) {
        if (message == null || message.isBlank()) return "No error message";
        String sanitized = SECRET.matcher(message).replaceAll("$1=[REDACTED]")
                .replaceAll("[\\r\\n]+", " ")
                .trim();
        return sanitized.substring(0, Math.min(sanitized.length(), 2000));
    }
}
