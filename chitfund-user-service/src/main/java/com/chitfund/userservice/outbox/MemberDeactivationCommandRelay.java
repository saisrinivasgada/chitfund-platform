package com.chitfund.userservice.outbox;

import com.chitfund.userservice.client.MemberServiceClient;
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
public class MemberDeactivationCommandRelay {
    private static final Pattern SECRET = Pattern.compile(
            "(?i)(authorization|password|secret|token|api[-_]?key)\\s*[:=]\\s*[^,;\\s]+"
    );

    private final MemberDeactivationCommandOutbox store;
    private final MemberServiceClient memberServiceClient;
    private final int batchSize;
    private final int maxAttempts;
    private final Duration leaseDuration;
    private final Counter completed;
    private final Counter retried;
    private final Counter failed;
    private final Counter staleFinalizations;
    private final AtomicLong pendingGauge = new AtomicLong();
    private final AtomicLong failedGauge = new AtomicLong();

    public MemberDeactivationCommandRelay(
            MemberDeactivationCommandOutbox store,
            MemberServiceClient memberServiceClient,
            MeterRegistry meterRegistry,
            @Value("${chitwise.member-deactivation-outbox.batch-size:50}") int batchSize,
            @Value("${chitwise.member-deactivation-outbox.max-attempts:10}") int maxAttempts,
            @Value("${chitwise.member-deactivation-outbox.lease-duration:PT30S}") Duration leaseDuration) {
        this.store = store;
        this.memberServiceClient = memberServiceClient;
        this.batchSize = Math.max(1, Math.min(batchSize, 500));
        this.maxAttempts = Math.max(1, maxAttempts);
        this.leaseDuration = leaseDuration.isNegative() || leaseDuration.isZero()
                ? Duration.ofSeconds(30) : leaseDuration;
        this.completed = meterRegistry.counter("chitwise.member.deactivation.completed");
        this.retried = meterRegistry.counter("chitwise.member.deactivation.retried");
        this.failed = meterRegistry.counter("chitwise.member.deactivation.failed");
        this.staleFinalizations = meterRegistry.counter("chitwise.member.deactivation.stale_finalize");
        Gauge.builder("chitwise.member.deactivation.pending", pendingGauge, AtomicLong::get)
                .register(meterRegistry);
        Gauge.builder("chitwise.member.deactivation.failed.current", failedGauge, AtomicLong::get)
                .register(meterRegistry);
    }

    @Scheduled(fixedDelayString = "${chitwise.member-deactivation-outbox.relay-delay-ms:2000}")
    public void drain() {
        try {
            for (MemberDeactivationCommand command : store.claimBatch(batchSize, leaseDuration)) {
                execute(command);
            }
        } finally {
            refreshMetrics();
        }
    }

    void execute(MemberDeactivationCommand command) {
        try {
            memberServiceClient.revokeAppAccess(command.tenantId(), command.memberId());
            if (store.markCompleted(command)) completed.increment();
            else staleFinalizations.increment();
        } catch (Exception exception) {
            int exponent = Math.min(command.attempts(), 8);
            long delaySeconds = Math.min(300, 1L << exponent);
            var result = store.markFailed(command, maxAttempts,
                    LocalDateTime.now(ZoneOffset.UTC).plusSeconds(delaySeconds),
                    exception.getClass().getSimpleName(), sanitize(exception.getMessage()));
            if (!result.updated()) {
                staleFinalizations.increment();
            } else if (result.terminal()) {
                failed.increment();
                log.error("MEMBER_DEACTIVATION_FAILURE: request {} permanently failed after {} attempts",
                        command.requestId(), result.attempts());
            } else {
                retried.increment();
                log.warn("Member deactivation request {} failed; retry {} scheduled in {}s",
                        command.requestId(), result.attempts(), delaySeconds);
            }
        }
    }

    private void refreshMetrics() {
        try {
            pendingGauge.set(store.countByStatus("PENDING") + store.countByStatus("IN_FLIGHT"));
            failedGauge.set(store.countByStatus("FAILED"));
        } catch (Exception exception) {
            log.warn("Could not refresh member deactivation metrics: {}", sanitize(exception.getMessage()));
        }
    }

    static String sanitize(String message) {
        if (message == null || message.isBlank()) return "No error message";
        String sanitized = SECRET.matcher(message).replaceAll("$1=[REDACTED]")
                .replaceAll("[\\r\\n]+", " ").trim();
        return sanitized.substring(0, Math.min(sanitized.length(), 2000));
    }
}
