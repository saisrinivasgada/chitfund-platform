package com.chitfund.supportservice.config;

import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.test.util.ReflectionTestUtils;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ProductionSecretsValidatorTest {

    @Test
    void rejectsKnownDefaultsInProduction() {
        ProductionSecretsValidator validator = validator(
                "management-service-jwt-secret-min-32-chars-dev",
                "chitfund-internal-service-key");

        assertThatThrownBy(validator::validate)
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("PRODUCTION STARTUP BLOCKED");
    }

    @Test
    void acceptsStrongInjectedSecretsInProduction() {
        ProductionSecretsValidator validator = validator(
                "3DDB122DB4204A3EAE9598A84A621E6DB5B3F4A788AF6C7F",
                "EF80E7BCAAF34A5C90B7B2AE6B13D0B2");

        assertThatCode(validator::validate).doesNotThrowAnyException();
    }

    private static ProductionSecretsValidator validator(String jwtSecret, String internalKey) {
        MockEnvironment environment = new MockEnvironment();
        environment.setActiveProfiles("prod");
        ProductionSecretsValidator validator = new ProductionSecretsValidator(environment);
        ReflectionTestUtils.setField(validator, "jwtSecret", jwtSecret);
        ReflectionTestUtils.setField(validator, "internalKey", internalKey);
        return validator;
    }
}
