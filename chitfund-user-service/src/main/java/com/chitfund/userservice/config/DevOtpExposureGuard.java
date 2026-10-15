package com.chitfund.userservice.config;

import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;

import java.util.Arrays;

@Configuration
@Slf4j
public class DevOtpExposureGuard {

    @Value("${app.dev.otp-exposure.enabled:false}")
    private boolean devOtpExposureEnabled;

    private final Environment environment;

    public DevOtpExposureGuard(Environment environment) {
        this.environment = environment;
    }

    @PostConstruct
    public void validate() {
        boolean isProd = Arrays.stream(environment.getActiveProfiles())
                .anyMatch(p -> p.equalsIgnoreCase("prod") || p.equalsIgnoreCase("production"));
        if (devOtpExposureEnabled && isProd) {
            throw new IllegalStateException(
                "app.dev.otp-exposure.enabled=true is not permitted under a production profile. " +
                "This configuration would expose OTP codes in API responses.");
        }
        if (devOtpExposureEnabled) {
            log.warn("DEV OTP EXPOSURE IS ENABLED — OTP codes will be returned in API responses. " +
                     "Never enable this in production.");
        }
    }
}
