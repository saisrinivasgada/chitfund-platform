package com.chitfund.userservice.config;

import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;

import java.util.Arrays;

@Configuration
@Slf4j
public class OtpLoggingGuard {

    @Value("${app.otp.logging-enabled:false}")
    private boolean otpLoggingEnabled;

    private final Environment environment;

    public OtpLoggingGuard(Environment environment) {
        this.environment = environment;
    }

    @PostConstruct
    public void validate() {
        boolean isProd = Arrays.stream(environment.getActiveProfiles())
                .anyMatch(p -> p.equalsIgnoreCase("prod") || p.equalsIgnoreCase("production"));
        if (otpLoggingEnabled && isProd) {
            throw new IllegalStateException(
                "app.otp.logging-enabled=true is not permitted under a production profile. " +
                "This configuration would write plaintext OTP codes to application logs.");
        }
        if (otpLoggingEnabled) {
            log.warn("OTP LOGGING IS ENABLED — plaintext OTP codes will be written to logs. " +
                     "Never enable this in production.");
        }
    }
}
