package com.chitfund.userservice.service;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.util.ReflectionTestUtils;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Startup validation tests for RateLimiterService HMAC key strength.
 * Every test creates the service with a specific key scenario and calls
 * validate() directly (the @PostConstruct method) to check its behaviour.
 */
@ExtendWith(MockitoExtension.class)
class RateLimiterHmacKeyValidationTest {

    @Mock JdbcTemplate jdbcTemplate;

    private RateLimiterService serviceWith(boolean enabled, String key) {
        RateLimiterService svc = new RateLimiterService(jdbcTemplate);
        ReflectionTestUtils.setField(svc, "enabled", enabled);
        ReflectionTestUtils.setField(svc, "hmacKey", key);
        return svc;
    }

    // ── disabled — key does not matter ────────────────────────────────────────

    @Test
    void disabledService_acceptsNullKey() {
        RateLimiterService svc = serviceWith(false, null);
        assertThatCode(svc::validate).doesNotThrowAnyException();
    }

    @Test
    void disabledService_acceptsBlankKey() {
        RateLimiterService svc = serviceWith(false, "");
        assertThatCode(svc::validate).doesNotThrowAnyException();
    }

    @Test
    void disabledService_acceptsShortKey() {
        RateLimiterService svc = serviceWith(false, "short");
        assertThatCode(svc::validate).doesNotThrowAnyException();
    }

    // ── enabled — missing key ─────────────────────────────────────────────────

    @Test
    void enabledService_rejectsMissingKey() {
        RateLimiterService svc = serviceWith(true, null);
        assertThatThrownBy(svc::validate)
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("must be set");
    }

    @Test
    void enabledService_rejectsBlankKey() {
        RateLimiterService svc = serviceWith(true, "   ");
        assertThatThrownBy(svc::validate)
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("must be set");
    }

    // ── enabled — insufficient length ─────────────────────────────────────────

    @Test
    void enabledService_rejects31ByteKey() {
        String key = "a".repeat(31); // 31 bytes < 32 minimum
        RateLimiterService svc = serviceWith(true, key);
        assertThatThrownBy(svc::validate)
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("32 bytes");
    }

    @Test
    void enabledService_rejectsSingleCharKey() {
        RateLimiterService svc = serviceWith(true, "x");
        assertThatThrownBy(svc::validate)
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("32 bytes");
    }

    // ── enabled — placeholder values ─────────────────────────────────────────

    @Test
    void enabledService_rejectsKeyContainingTest() {
        // 32+ byte key that still contains the word "test"
        String key = "test-only-hmac-key-for-unit-tests!!";
        RateLimiterService svc = serviceWith(true, key);
        assertThatThrownBy(svc::validate)
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("placeholder");
    }

    @Test
    void enabledService_rejectsKeyContainingSecret() {
        String key = "changeme-this-is-a-secret-placeholder-value";
        RateLimiterService svc = serviceWith(true, key);
        assertThatThrownBy(svc::validate)
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("placeholder");
    }

    @Test
    void enabledService_rejectsKeyContainingDefault() {
        String key = "default-rate-limit-hmac-key-value-here!!";
        RateLimiterService svc = serviceWith(true, key);
        assertThatThrownBy(svc::validate)
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("placeholder");
    }

    // ── enabled — valid production-strength key ───────────────────────────────

    @Test
    void enabledService_acceptsValidHighEntropyKey() {
        // 64-hex-char key (32 bytes) with no placeholder words
        String key = "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2";
        RateLimiterService svc = serviceWith(true, key);
        assertThatCode(svc::validate).doesNotThrowAnyException();
    }

    @Test
    void enabledService_accepts32ByteRandomKey() {
        String key = "X9kLmNpQrSvWxYzAbCdEfGhIjKlMnOpQ"; // exactly 32 bytes, no placeholders
        RateLimiterService svc = serviceWith(true, key);
        assertThatCode(svc::validate).doesNotThrowAnyException();
    }
}
