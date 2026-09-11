package com.chitfund.paymentservice.config;

import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;
import org.springframework.validation.annotation.Validated;

import java.time.Duration;

@Component
@ConfigurationProperties(prefix = "chitwise.events")
@Validated
@Data
public class EventDeliveryProperties {

    public enum Mode {
        LEGACY, DUAL, OUTBOX;

        public boolean writesOutbox() {
            return this == DUAL || this == OUTBOX;
        }

        public boolean publishesLegacy() {
            return this == LEGACY || this == DUAL;
        }
    }

    /** Production-safe rollout default: explicitly opt in after inbox consumers deploy. */
    @NotNull
    private Mode mode = Mode.LEGACY;
    private boolean relayEnabled = true;
    @Min(1)
    @Max(500)
    private int batchSize = 100;
    @Min(1)
    @Max(100)
    private int maxAttempts = 10;
    @NotNull
    private Duration leaseDuration = Duration.ofSeconds(30);
    private boolean retentionEnabled = false;
    @Min(7) @Max(3650)
    private int retentionDays = 90;
    @Min(1) @Max(10000)
    private int retentionBatchSize = 1000;

    @AssertTrue(message = "chitwise.events.lease-duration must be positive")
    public boolean isLeaseDurationPositive() {
        return leaseDuration != null && !leaseDuration.isZero() && !leaseDuration.isNegative();
    }
}
