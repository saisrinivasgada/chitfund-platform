package com.chitfund.userservice.outbox;

import com.chitfund.userservice.service.AuthService;
import com.chitfund.userservice.service.EmailService;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.concurrent.atomic.AtomicLong;
import java.util.regex.Pattern;

@Component
@Slf4j
public class SetupEmailRelay {
    private static final Pattern SECRET = Pattern.compile(
            "(?i)(authorization|password|secret|token|api[-_]?key|setup[-_]?link)\\s*[:=]\\s*[^,;\\s]+"
    );

    private final SetupEmailOutbox store;
    private final AuthService authService;
    private final EmailService emailService;
    private final JdbcTemplate jdbcTemplate;
    private final String frontendUrl;
    private final int batchSize;
    private final int maxAttempts;
    private final Duration leaseDuration;
    private final Counter completed;
    private final Counter retried;
    private final Counter failed;
    private final Counter staleFinalizations;
    private final AtomicLong pendingGauge = new AtomicLong();
    private final AtomicLong failedGauge = new AtomicLong();

    public SetupEmailRelay(
            SetupEmailOutbox store,
            AuthService authService,
            EmailService emailService,
            JdbcTemplate jdbcTemplate,
            MeterRegistry meterRegistry,
            @Value("${app.frontend-url}") String frontendUrl,
            @Value("${chitwise.setup-email-outbox.batch-size:50}") int batchSize,
            @Value("${chitwise.setup-email-outbox.max-attempts:5}") int maxAttempts,
            @Value("${chitwise.setup-email-outbox.lease-duration:PT30S}") Duration leaseDuration) {
        this.store = store;
        this.authService = authService;
        this.emailService = emailService;
        this.jdbcTemplate = jdbcTemplate;
        this.frontendUrl = frontendUrl;
        this.batchSize = Math.max(1, Math.min(batchSize, 500));
        this.maxAttempts = Math.max(1, maxAttempts);
        this.leaseDuration = leaseDuration.isNegative() || leaseDuration.isZero()
                ? Duration.ofSeconds(30) : leaseDuration;
        this.completed = meterRegistry.counter("chitwise.setup.email.completed");
        this.retried = meterRegistry.counter("chitwise.setup.email.retried");
        this.failed = meterRegistry.counter("chitwise.setup.email.failed");
        this.staleFinalizations = meterRegistry.counter("chitwise.setup.email.stale_finalize");
        Gauge.builder("chitwise.setup.email.pending", pendingGauge, AtomicLong::get)
                .register(meterRegistry);
        Gauge.builder("chitwise.setup.email.failed.current", failedGauge, AtomicLong::get)
                .register(meterRegistry);
    }

    @Scheduled(fixedDelayString = "${chitwise.setup-email-outbox.relay-delay-ms:3000}")
    public void drain() {
        try {
            for (SetupEmailCommand command : store.claimBatch(batchSize, leaseDuration)) {
                execute(command);
            }
        } finally {
            refreshMetrics();
        }
    }

    void execute(SetupEmailCommand command) {
        try {
            // Generate a fresh single-use token for this delivery attempt.
            // generateSetupToken() invalidates any prior unused tokens for this request,
            // so the member always receives the most recently issued link.
            // The raw token is never logged — only delivery_id and request_id appear in logs.
            String rawToken = authService.generateSetupToken(
                    command.candidateUserId(), command.requestId());
            String setupLink = frontendUrl + "/setup?token=" + rawToken;
            emailService.sendFirstTimeSetupEmail(
                    command.toEmail(), command.fullName(), setupLink, command.orgName());
            markRequestDelivered(command);
            if (store.markCompleted(command)) completed.increment();
            else staleFinalizations.increment();
            log.info("Setup email delivered: delivery_id={} request_id={}",
                    command.deliveryId(), command.requestId());
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
                markRequestFailed(command);
                log.error("SETUP_EMAIL_FAILURE: request {} permanently failed after {} attempts",
                        command.requestId(), result.attempts());
            } else {
                retried.increment();
                log.warn("Setup email delivery {} failed; retry {} scheduled in {}s",
                        command.deliveryId(), result.attempts(), delaySeconds);
            }
        }
    }

    private void markRequestDelivered(SetupEmailCommand command) {
        jdbcTemplate.update("""
                UPDATE chitfund_access_requests
                SET setup_email_status='SENT', setup_email_sent_at=UTC_TIMESTAMP(6)
                WHERE id=? AND setup_email_status IN ('PENDING','FAILED')
                """, command.requestId().toString());
    }

    private void markRequestFailed(SetupEmailCommand command) {
        jdbcTemplate.update("""
                UPDATE chitfund_access_requests
                SET setup_email_status='FAILED'
                WHERE id=? AND setup_email_status='PENDING'
                """, command.requestId().toString());
    }

    private void refreshMetrics() {
        try {
            pendingGauge.set(store.countByStatus("PENDING") + store.countByStatus("IN_FLIGHT"));
            failedGauge.set(store.countByStatus("FAILED"));
        } catch (Exception exception) {
            log.warn("Could not refresh setup email metrics: {}", sanitize(exception.getMessage()));
        }
    }

    static String sanitize(String message) {
        if (message == null || message.isBlank()) return "No error message";
        String sanitized = SECRET.matcher(message).replaceAll("$1=[REDACTED]")
                .replaceAll("[\\r\\n]+", " ").trim();
        return sanitized.substring(0, Math.min(sanitized.length(), 2000));
    }
}
