package com.chitfund.reportingservice.config;

import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Set;

@Configuration
@Slf4j
public class ProductionSecretsValidator {

    private static final Set<String> KNOWN_COMPROMISED_DEFAULTS = Set.of(
        "chitfund-super-secret-key-that-is-at-least-256-bits-long-for-hs256-algorithm",
        "chitfund-internal-service-key",
        "secret",
        "password",
        "changeme",
        "test",
        "dev",
        "development"
    );

    @Value("${jwt.secret}")
    private String jwtSecret;

    @Value("${reporting.internal-key}")
    private String internalKey;

    private final Environment environment;

    public ProductionSecretsValidator(Environment environment) {
        this.environment = environment;
    }

    @PostConstruct
    public void validate() {
        boolean isProd = Arrays.asList(environment.getActiveProfiles()).contains("prod");
        if (!isProd) {
            return;
        }

        List<String> violations = new ArrayList<>();

        if (isCompromised(jwtSecret, 32)) {
            violations.add("JWT_SECRET is absent, too short, or a known default value");
        }
        if (isCompromised(internalKey, 16)) {
            violations.add("INTERNAL_SERVICE_KEY is absent, too short, or a known default value");
        }

        if (!violations.isEmpty()) {
            String msg = "\n\n" +
                "==========================================================\n" +
                "  PRODUCTION STARTUP BLOCKED — INSECURE SECRETS DETECTED\n" +
                "==========================================================\n" +
                String.join("\n", violations.stream().map(v -> "  * " + v).toList()) + "\n" +
                "\nSet each secret to a cryptographically random value of the\n" +
                "required length in your production secret manager, then redeploy.\n" +
                "==========================================================\n";
            throw new IllegalStateException(msg);
        }

        log.info("ProductionSecretsValidator: all required secrets present and non-default");
    }

    private boolean isCompromised(String value, int minLength) {
        if (value == null || value.isBlank()) return true;
        if (value.length() < minLength) return true;
        return KNOWN_COMPROMISED_DEFAULTS.contains(value.trim().toLowerCase());
    }
}
