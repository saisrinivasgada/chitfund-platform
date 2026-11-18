package com.chitfund.userservice.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.MethodOrderer;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestMethodOrder;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.testcontainers.containers.MySQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Real MySQL 8 integration tests for RateLimiterService.
 *
 * Tests run against a fresh Testcontainers MySQL 8 instance with rate
 * limiting ENABLED and a strong, non-placeholder HMAC key.
 */
@DataJpaTest(properties = {
        "spring.jpa.hibernate.ddl-auto=none",
        "spring.flyway.enabled=true",
        "app.rate-limit.enabled=true",
        "app.rate-limit.hmac-key=Z7rKvMx4nQ9sLpWe2HdAyTiCjBuGfRo1"
})
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Testcontainers(disabledWithoutDocker = true)
@Transactional(propagation = Propagation.NOT_SUPPORTED)
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class RateLimiterServiceMySqlTest {

    // The test HMAC key must be ≥32 bytes and contain no placeholder words.
    // It is intentionally different from any production key and is stored only
    // in this test file — never in a config file that could reach production.
    private static final String TEST_HMAC_KEY = "Z7rKvMx4nQ9sLpWe2HdAyTiCjBuGfRo1";

    @Container
    static final MySQLContainer<?> MYSQL = new MySQLContainer<>("mysql:8.0")
            .withDatabaseName("chitfund_users")
            .withUsername("chitfund")
            .withPassword("testpassword");

    @DynamicPropertySource
    static void databaseProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", MYSQL::getJdbcUrl);
        registry.add("spring.datasource.username", MYSQL::getUsername);
        registry.add("spring.datasource.password", MYSQL::getPassword);
    }

    @Autowired JdbcTemplate jdbcTemplate;

    private RateLimiterService limiter;

    @BeforeEach
    void setUp() {
        limiter = new RateLimiterService(jdbcTemplate);
        ReflectionTestUtils.setField(limiter, "enabled", true);
        ReflectionTestUtils.setField(limiter, "hmacKey", TEST_HMAC_KEY);
        ReflectionTestUtils.setField(limiter, "loginPer15Min", 50);
        ReflectionTestUtils.setField(limiter, "otpSendPer15Min", 5);
        ReflectionTestUtils.setField(limiter, "otpVerifyPer15Min", 10);
        // Clean up any counters left by a previous test
        jdbcTemplate.update("DELETE FROM rate_limit_counters");
    }

    // ── Sliding-window budget enforcement ─────────────────────────────────────

    @Test
    void fiveSendsPermitted_sixthRejected() {
        String ip = "10.0.0.1";
        int allowed = 0;
        for (int i = 0; i < 6; i++) {
            if (limiter.tryConsumeRegOtp(ip)) allowed++;
        }
        assertThat(allowed).isEqualTo(5);
    }

    @Test
    void loginBudgetIsIndependentOfOtpBudget() {
        String ip = "10.0.0.2";
        // Exhaust OTP send budget (5)
        for (int i = 0; i < 5; i++) limiter.tryConsumeRegOtp(ip);

        // Login budget (50) is untouched — first login attempt must succeed
        assertThat(limiter.tryConsumeLogin(ip)).isTrue();
    }

    // ── Send and verify are separate budgets ──────────────────────────────────

    @Test
    void sendAndVerifyBudgetsAreIndependent() {
        String ip = "10.0.0.3";
        // Exhaust send budget
        for (int i = 0; i < 5; i++) limiter.tryConsumeRegOtp(ip);
        assertThat(limiter.tryConsumeRegOtp(ip)).isFalse();

        // Verify budget is still untouched — first verify must succeed
        assertThat(limiter.tryConsumeRegOtpVerify(ip)).isTrue();
    }

    // ── Distinct purposes never consume each other ────────────────────────────

    @Test
    void distinctPurposesDontConsumeEachOther() {
        String ip = "10.0.0.4";
        // Exhaust FP_OTP send budget
        for (int i = 0; i < 5; i++) limiter.tryConsumeFpOtp(ip);
        assertThat(limiter.tryConsumeFpOtp(ip)).isFalse();

        // REG_OTP budget is untouched — first attempt must succeed
        assertThat(limiter.tryConsumeRegOtp(ip)).isTrue();
        // FP_OTP_VERIFY budget is also untouched
        assertThat(limiter.tryConsumeFpOtpVerify(ip)).isTrue();
    }

    // ── Org-user setup has its own bucket ─────────────────────────────────────

    @Test
    void orgUserSetupOtpBudgetIsIndependent() {
        String ip = "10.0.0.5";
        // Exhaust org-user setup send budget
        for (int i = 0; i < 5; i++) limiter.tryConsumeOrgUserSetupOtp(ip);
        assertThat(limiter.tryConsumeOrgUserSetupOtp(ip)).isFalse();

        // Verify budget for same purpose is untouched
        assertThat(limiter.tryConsumeOrgUserSetupOtpVerify(ip)).isTrue();
        // Other purpose untouched
        assertThat(limiter.tryConsumeRegOtp(ip)).isTrue();
    }

    // ── Raw IP is never stored ────────────────────────────────────────────────

    @Test
    void rawIpNeverStoredInDb() {
        String ip = "10.0.0.6";
        limiter.tryConsumeRegOtp(ip);

        // The client_hash column must not contain the raw IP in any row
        List<String> rawIpRows = jdbcTemplate.queryForList(
                "SELECT client_hash FROM rate_limit_counters WHERE client_hash LIKE ?",
                String.class, "%" + ip + "%");
        assertThat(rawIpRows).isEmpty();
    }

    // ── HMAC is deterministic and consistent ─────────────────────────────────

    @Test
    void sameIpHashesToSameValueEveryTime() {
        String ip = "10.0.0.7";
        String hash1 = limiter.hmacIp(ip);
        String hash2 = limiter.hmacIp(ip);
        assertThat(hash1).isEqualTo(hash2);
        // Hash must be hex (HMAC-SHA256 = 64 hex chars)
        assertThat(hash1).matches("[0-9a-f]{64}");
    }

    @Test
    void differentIpsHashToDifferentValues() {
        assertThat(limiter.hmacIp("10.0.0.8")).isNotEqualTo(limiter.hmacIp("10.0.0.9"));
    }

    // ── Two service instances share one limit ─────────────────────────────────

    @Test
    void twoServiceInstancesShareOneRateLimitBucket() {
        String ip = "10.0.0.10";
        RateLimiterService limiter2 = new RateLimiterService(jdbcTemplate);
        ReflectionTestUtils.setField(limiter2, "enabled", true);
        ReflectionTestUtils.setField(limiter2, "hmacKey", TEST_HMAC_KEY);
        ReflectionTestUtils.setField(limiter2, "otpSendPer15Min", 5);

        // First instance consumes 4, second consumes 2 → total 6 against limit 5
        int totalAllowed = 0;
        for (int i = 0; i < 4; i++) if (limiter.tryConsumeRegOtp(ip)) totalAllowed++;
        for (int i = 0; i < 2; i++) if (limiter2.tryConsumeRegOtp(ip)) totalAllowed++;

        assertThat(totalAllowed).isEqualTo(5);
    }

    // ── Concurrency: two concurrent requests hit the same bucket ─────────────

    @Test
    void concurrentRequestsFromSameIpShareBudget() throws Exception {
        String ip = "10.0.0.11";
        int threads = 8;
        ExecutorService pool = Executors.newFixedThreadPool(threads);
        CountDownLatch start = new CountDownLatch(1);
        AtomicInteger allowed = new AtomicInteger(0);

        List<Future<?>> futures = new ArrayList<>();
        for (int i = 0; i < threads; i++) {
            futures.add(pool.submit(() -> {
                try { start.await(); } catch (InterruptedException ignored) {}
                if (limiter.tryConsumeRegOtp(ip)) allowed.incrementAndGet();
            }));
        }
        start.countDown();
        for (Future<?> f : futures) f.get(10, TimeUnit.SECONDS);
        pool.shutdown();

        // OTP send budget is 5 — at most 5 should have been allowed
        assertThat(allowed.get()).isLessThanOrEqualTo(5);
        // At least 5 succeeded (no under-counting)
        assertThat(allowed.get()).isEqualTo(5);
    }

    // ── DB failure closes ─────────────────────────────────────────────────────

    // Drops the counters table — must run LAST so it cannot corrupt other tests.
    @Test
    @Order(Integer.MAX_VALUE)
    void dbFailureReturnsFalse_failClosed() {
        RateLimiterService brokenLimiter = new RateLimiterService(jdbcTemplate);
        ReflectionTestUtils.setField(brokenLimiter, "enabled", true);
        ReflectionTestUtils.setField(brokenLimiter, "hmacKey", TEST_HMAC_KEY);
        ReflectionTestUtils.setField(brokenLimiter, "otpSendPer15Min", 5);

        // Drop the counters table so the next DB operation fails
        jdbcTemplate.execute("DROP TABLE IF EXISTS rate_limit_counters");
        try {
            boolean result = brokenLimiter.tryConsumeRegOtp("10.0.0.12");
            assertThat(result).isFalse();
        } finally {
            // Recreate the table for subsequent tests (Flyway owns schema)
            // The table will be recreated in the next test's @BeforeEach via flyway,
            // but since we only have @BeforeEach cleanup we need to restore it here.
            jdbcTemplate.execute(
                    "CREATE TABLE IF NOT EXISTS rate_limit_counters (" +
                    "  client_hash  VARCHAR(64)     NOT NULL," +
                    "  purpose      VARCHAR(40)     NOT NULL," +
                    "  minute_epoch BIGINT          NOT NULL," +
                    "  count        INT UNSIGNED    NOT NULL DEFAULT 1," +
                    "  PRIMARY KEY (client_hash, purpose, minute_epoch)" +
                    ") ENGINE=InnoDB");
        }
    }

    // ── Cleanup removes old rows ──────────────────────────────────────────────

    @Test
    void cleanupRemovesExpiredRows() {
        // Insert a row with a minute_epoch well in the past (> 30 minutes ago)
        long staleMinute = (System.currentTimeMillis() / 60000L) - 60;
        jdbcTemplate.update(
                "INSERT INTO rate_limit_counters (client_hash, purpose, minute_epoch, count) VALUES (?,?,?,?)",
                "deadbeef".repeat(8), "REG_OTP", staleMinute, 1);

        limiter.cleanupExpired();

        Integer remaining = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM rate_limit_counters WHERE minute_epoch = ?",
                Integer.class, staleMinute);
        assertThat(remaining).isZero();
    }
}
