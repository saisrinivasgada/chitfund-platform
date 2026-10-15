package com.chitfund.notificationservice.outbox;

import com.chitfund.notificationservice.sender.EmailSender;
import com.chitfund.notificationservice.sender.NotificationSender;
import com.chitfund.notificationservice.service.ExpoPushService;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.concurrent.atomic.AtomicLong;
import java.util.regex.Pattern;

@Component
@Slf4j
public class NotificationDeliveryRelay {

    private static final Pattern SECRET = Pattern.compile(
            "(?i)(authorization|password|secret|token|api[-_]?key)\\s*[:=]\\s*[^,;\\s]+"
    );

    private final NotificationDeliveryOutbox outbox;
    private final ExpoPushService pushService;
    private final EmailSender emailSender;
    private final NotificationSender notificationSender;
    private final ObjectMapper objectMapper;
    private final Counter published;
    private final Counter retried;
    private final Counter failed;
    private final Counter staleFinalizations;
    private final AtomicLong pendingGauge = new AtomicLong();
    private final AtomicLong failedGauge = new AtomicLong();
    private final AtomicLong oldestGauge = new AtomicLong();

    @Value("${chitwise.notification-delivery.batch-size:100}")
    private int batchSize;

    @Value("${chitwise.notification-delivery.max-attempts:10}")
    private int maxAttempts;

    @Value("${chitwise.notification-delivery.lease-seconds:30}")
    private long leaseSeconds;

    public NotificationDeliveryRelay(NotificationDeliveryOutbox outbox,
                                     ExpoPushService pushService,
                                     EmailSender emailSender,
                                     NotificationSender notificationSender,
                                     ObjectMapper objectMapper,
                                     MeterRegistry meterRegistry) {
        this.outbox = outbox;
        this.pushService = pushService;
        this.emailSender = emailSender;
        this.notificationSender = notificationSender;
        this.objectMapper = objectMapper;
        this.published = meterRegistry.counter("chitwise.notification.delivery.published");
        this.retried = meterRegistry.counter("chitwise.notification.delivery.retried");
        this.failed = meterRegistry.counter("chitwise.notification.delivery.failed");
        this.staleFinalizations = meterRegistry.counter("chitwise.notification.delivery.stale_finalize");
        Gauge.builder("chitwise.notification.delivery.pending", pendingGauge, AtomicLong::get)
                .register(meterRegistry);
        Gauge.builder("chitwise.notification.delivery.failed.current", failedGauge, AtomicLong::get)
                .register(meterRegistry);
        Gauge.builder("chitwise.notification.delivery.oldest.seconds", oldestGauge, AtomicLong::get)
                .register(meterRegistry);
    }

    @Scheduled(fixedDelayString = "${chitwise.notification-delivery.relay-delay-ms:2000}")
    public void drain() {
        try {
            Duration lease = Duration.ofSeconds(Math.max(1, leaseSeconds));
            for (NotificationDelivery delivery : outbox.claimBatch(batchSize, lease)) {
                deliverOne(delivery);
            }
        } finally {
            refreshMetrics();
        }
    }

    void deliverOne(NotificationDelivery delivery) {
        try {
            String externalId = deliver(delivery);
            if (outbox.markPublished(delivery, externalId)) published.increment();
            else staleFinalizations.increment();
        } catch (Exception exception) {
            int exponent = Math.min(delivery.attempts(), 8);
            long delaySeconds = Math.min(300, 1L << exponent);
            var result = outbox.markFailed(delivery, Math.max(1, maxAttempts),
                    LocalDateTime.now(ZoneOffset.UTC).plusSeconds(delaySeconds),
                    exception.getClass().getSimpleName(), sanitize(exception.getMessage()));
            if (!result.updated()) {
                staleFinalizations.increment();
            } else if (result.terminal()) {
                failed.increment();
                log.error("NOTIFICATION_DELIVERY_FAILED: delivery {} permanently failed after {} attempts",
                        delivery.deliveryId(), result.attempts());
            } else {
                retried.increment();
                log.warn("Notification delivery {} failed; retry {} scheduled in {}s",
                        delivery.deliveryId(), result.attempts(), delaySeconds);
            }
        }
    }

    private String deliver(NotificationDelivery delivery) throws Exception {
        return switch (delivery.deliveryType()) {
            case NotificationDeliveryQueue.PUSH -> {
                var payload = objectMapper.readValue(delivery.payload(),
                        NotificationDeliveryQueue.PushPayload.class);
                pushService.sendToToken(payload.token(), payload.title(), payload.body(), payload.data());
                yield null;
            }
            case NotificationDeliveryQueue.EMAIL -> {
                var payload = objectMapper.readValue(delivery.payload(),
                        NotificationDeliveryQueue.EmailPayload.class);
                emailSender.send(payload.toEmail(), payload.subject(),
                        payload.textBody(), payload.htmlBody());
                yield null;
            }
            case NotificationDeliveryQueue.CHANNEL -> {
                var payload = objectMapper.readValue(delivery.payload(),
                        NotificationDeliveryQueue.ChannelPayload.class);
                var result = notificationSender.send(
                        payload.to(), payload.message(), payload.channel());
                if (!result.success()) {
                    throw new IllegalStateException(result.errorMessage() == null
                            ? "Notification provider rejected delivery" : result.errorMessage());
                }
                yield result.externalId();
            }
            default -> throw new IllegalArgumentException(
                    "Unsupported notification delivery type: " + delivery.deliveryType());
        };
    }

    private void refreshMetrics() {
        try {
            pendingGauge.set(outbox.countByStatus("PENDING") + outbox.countByStatus("IN_FLIGHT"));
            failedGauge.set(outbox.countByStatus("FAILED"));
            oldestGauge.set(outbox.oldestUnpublishedAgeSeconds());
        } catch (Exception exception) {
            log.warn("Could not refresh notification delivery metrics: {}",
                    sanitize(exception.getMessage()));
        }
    }

    static String sanitize(String message) {
        if (message == null || message.isBlank()) return "No error message";
        String sanitized = SECRET.matcher(message).replaceAll("$1=[REDACTED]")
                .replaceAll("[\\r\\n]+", " ").trim();
        return sanitized.substring(0, Math.min(sanitized.length(), 2000));
    }
}
