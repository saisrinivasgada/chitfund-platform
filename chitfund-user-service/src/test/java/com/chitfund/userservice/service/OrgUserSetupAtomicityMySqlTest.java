package com.chitfund.userservice.service;

import com.chitfund.common.exception.BusinessException;
import com.chitfund.common.exception.ErrorCode;
import com.chitfund.common.outbox.DurableAuditOutbox;
import com.chitfund.userservice.client.AuditClient;
import com.chitfund.userservice.domain.entity.AccountEmailOtp;
import com.chitfund.userservice.domain.entity.AccountSetupToken;
import com.chitfund.userservice.domain.entity.User;
import com.chitfund.userservice.domain.enums.Role;
import com.chitfund.userservice.domain.enums.SetupTokenPurpose;
import com.chitfund.userservice.dto.request.OrgUserSetupCompleteRequest;
import com.chitfund.userservice.exception.IncorrectOtpException;
import com.chitfund.userservice.repository.AccountEmailOtpRepository;
import com.chitfund.userservice.repository.AccountSetupTokenRepository;
import com.chitfund.userservice.repository.UserRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.containers.MySQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.net.URI;
import java.net.http.HttpClient;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.mockito.ArgumentMatchers.any;

/**
 * Real MySQL 8 atomicity tests for OrgUserSetupService.complete().
 *
 * Verifies the two-phase OTP design:
 *   Phase 1: checkAndIncrementAttempt() runs in its own REQUIRES_NEW transaction
 *            — the attempt counter is committed even if the outer transaction later
 *            rolls back.
 *   Phase 2: markConsumed() runs in the caller's (outer) transaction — if any
 *            subsequent write fails the OTP verified flag is rolled back atomically,
 *            keeping the OTP reusable.
 *
 * These tests also verify that pre-OTP validations (terms, password policy) never
 * touch the OTP record, so a bad password or missing terms-acceptance never burns
 * the user's valid OTP.
 */
@DataJpaTest(properties = {
        "spring.jpa.hibernate.ddl-auto=none",
        "spring.flyway.enabled=true",
        "app.rate-limit.enabled=false"
})
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Testcontainers(disabledWithoutDocker = true)
@Transactional(propagation = Propagation.NOT_SUPPORTED)
@Import({
        OrgUserSetupAtomicityMySqlTest.Config.class,
        AccountEmailOtpService.class,
        OrgUserSetupService.class
})
class OrgUserSetupAtomicityMySqlTest {

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

    @TestConfiguration
    static class Config {
        @Bean
        PasswordEncoder passwordEncoder() {
            return new BCryptPasswordEncoder();
        }

        @Bean
        ObjectMapper objectMapper() {
            return new ObjectMapper();
        }

        @Bean
        DurableAuditOutbox durableAuditOutbox(JdbcTemplate jdbc) {
            return new DurableAuditOutbox(jdbc);
        }

        @Bean
        AuditClient auditClient(DurableAuditOutbox outbox, ObjectMapper mapper) {
            return new AuditClient(outbox, mapper);
        }

        /**
         * EmailService depends on AWS SES — provide a no-op mock.
         * AccountEmailOtpService.checkAndIncrementAttempt() and markConsumed()
         * never call emailService, so this is only needed for bean wiring.
         */
        @Bean
        EmailService emailService() {
            return mock(EmailService.class);
        }

        /**
         * PasswordValidator makes an outbound HIBP call — provide an instance
         * whose HttpClient fails immediately so the breach check is skipped
         * gracefully (PasswordValidator catches all non-BusinessExceptions).
         */
        @Bean
        PasswordValidator passwordValidator() {
            @SuppressWarnings("unchecked")
            HttpClient noopHttp = mock(HttpClient.class);
            CompletableFuture<Object> failed = new CompletableFuture<>();
            failed.completeExceptionally(new java.io.IOException("test — no network"));
            when(noopHttp.sendAsync(any(), any())).thenReturn(failed);
            return new PasswordValidator(noopHttp,
                    URI.create("https://test.invalid/range/"),
                    Duration.ofMillis(10));
        }
    }

    // ── Injected ──────────────────────────────────────────────────────────────

    @Autowired OrgUserSetupService orgUserSetupService;
    @Autowired AccountEmailOtpRepository otpRepository;
    @Autowired AccountSetupTokenRepository tokenRepository;
    @Autowired UserRepository userRepository;
    @Autowired JdbcTemplate jdbc;
    @Autowired PlatformTransactionManager txManager;

    private TransactionTemplate tx;

    private static final String STRONG_PASSWORD = "Test@1234";
    private static final String SETUP_PURPOSE = "ORG_USER_SETUP";

    // ── Setup / teardown ──────────────────────────────────────────────────────

    @BeforeEach
    void cleanDb() {
        tx = new TransactionTemplate(txManager);
        jdbc.update("DELETE FROM audit_event_outbox");
        jdbc.update("DELETE FROM account_email_otps");
        jdbc.update("DELETE FROM account_setup_tokens");
        jdbc.update("DELETE FROM refresh_tokens");
        jdbc.update("DELETE FROM trusted_devices");
        jdbc.update("DELETE FROM users");
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private UUID saveUser() {
        return tx.execute(s -> userRepository.save(User.builder()
                .username("u-" + UUID.randomUUID().toString().replace("-", "").substring(0, 8))
                .email("u-" + UUID.randomUUID() + "@test.example")
                .fullName("Test User")
                .passwordHash("$2a$10$placeholder")
                .role(Role.MANAGER)
                .tenantId(UUID.randomUUID().toString())
                .build()).getId());
    }

    /** Returns the raw (un-hashed) token string. */
    private String saveInviteToken(UUID userId) {
        String rawToken = UUID.randomUUID().toString();
        tx.execute(s -> tokenRepository.save(AccountSetupToken.builder()
                .userId(userId)
                .purpose(SetupTokenPurpose.ORG_USER_INVITE)
                .tokenHash(OrgUserSetupService.sha256(rawToken))
                .expiresAt(LocalDateTime.now().plusHours(72))
                .build()));
        return rawToken;
    }

    private String saveOtp(UUID userId, String email, String code, int attempts) {
        return tx.execute(s -> {
            AccountEmailOtp otp = AccountEmailOtp.builder()
                    .userId(userId.toString())
                    .email(email)
                    .verificationCode(code)
                    .purpose(SETUP_PURPOSE)
                    .attempts(attempts)
                    .expiresAt(LocalDateTime.now().plusMinutes(10))
                    .build();
            return otpRepository.save(otp).getId();
        });
    }

    private OrgUserSetupCompleteRequest buildRequest(String rawToken, String otp,
                                                     String password, boolean terms) {
        OrgUserSetupCompleteRequest req = new OrgUserSetupCompleteRequest();
        req.setToken(rawToken);
        req.setEmailOtp(otp);
        req.setNewPassword(password);
        req.setTermsAccepted(terms);
        return req;
    }

    private AccountEmailOtp loadOtp(String otpId) {
        return tx.execute(s -> otpRepository.findById(otpId)
                .orElseThrow(() -> new AssertionError("OTP not found: " + otpId)));
    }

    private User loadUser(UUID userId) {
        return tx.execute(s -> userRepository.findById(userId)
                .orElseThrow(() -> new AssertionError("User not found: " + userId)));
    }

    // ── Tests ─────────────────────────────────────────────────────────────────

    /**
     * Full happy path: OTP is consumed exactly once, user fields updated,
     * invite token marked used.
     */
    @Test
    void happyPath_completesAccountSetupAndConsumesOtp() {
        UUID userId = saveUser();
        User user = loadUser(userId);
        String rawToken = saveInviteToken(userId);
        String otpCode = "123456";
        String otpId = saveOtp(userId, user.getEmail(), otpCode, 0);

        orgUserSetupService.complete(buildRequest(rawToken, otpCode, STRONG_PASSWORD, true));

        AccountEmailOtp otp = loadOtp(otpId);
        assertThat(otp.isVerified()).isTrue();
        assertThat(otp.getAttempts()).isEqualTo(1);

        User updated = loadUser(userId);
        assertThat(updated.isMustChangePassword()).isFalse();
        assertThat(updated.isEmailVerificationRequired()).isFalse();
        assertThat(updated.getEmailVerifiedAt()).isNotNull();
        assertThat(updated.getTermsAcceptedAt()).isNotNull();
        // Password hash must change from placeholder
        assertThat(updated.getPasswordHash()).isNotEqualTo("$2a$10$placeholder");

        Long activeTokens = jdbc.queryForObject(
                "SELECT COUNT(*) FROM account_setup_tokens WHERE user_id = ? " +
                "AND purpose = 'ORG_USER_INVITE' AND used_at IS NULL",
                Long.class, userId.toString());
        assertThat(activeTokens).isZero();
    }

    /**
     * Wrong OTP: the REQUIRES_NEW inner transaction commits the attempt count
     * even though the outer transaction has no successful changes. The OTP
     * remains unconsumed (verified=false) — the user can retry with the correct code.
     */
    @Test
    void incorrectOtp_attemptCountCommittedAtomically_otpRemainsUsable() {
        UUID userId = saveUser();
        User user = loadUser(userId);
        String rawToken = saveInviteToken(userId);
        String otpCode = "654321";
        String otpId = saveOtp(userId, user.getEmail(), otpCode, 0);

        assertThatThrownBy(() ->
                orgUserSetupService.complete(
                        buildRequest(rawToken, "000000", STRONG_PASSWORD, true)))
                .isInstanceOf(IncorrectOtpException.class)
                .extracting(ex -> ((IncorrectOtpException) ex).getErrorCode())
                .isEqualTo(ErrorCode.OTP_INVALID);

        AccountEmailOtp otp = loadOtp(otpId);
        // Attempt count is committed (REQUIRES_NEW) even though outer tx was empty
        assertThat(otp.getAttempts()).isEqualTo(1);
        // OTP is NOT consumed — user can retry with correct code
        assertThat(otp.isVerified()).isFalse();
    }

    /**
     * After MAX_ATTEMPTS wrong codes, the next attempt throws OTP_MAX_ATTEMPTS
     * and the attempt count does NOT increment further (rejected before save).
     */
    @Test
    void incorrectOtp_atMaxAttempts_rejectsWithOtpMaxAttemptsError() {
        UUID userId = saveUser();
        User user = loadUser(userId);
        String rawToken = saveInviteToken(userId);
        // Pre-set attempts to MAX (5) — simulates having already exhausted retries
        String otpId = saveOtp(userId, user.getEmail(), "999999", 5);

        assertThatThrownBy(() ->
                orgUserSetupService.complete(
                        buildRequest(rawToken, "000000", STRONG_PASSWORD, true)))
                .isInstanceOf(BusinessException.class)
                .extracting(ex -> ((BusinessException) ex).getErrorCode())
                .isEqualTo(ErrorCode.OTP_MAX_ATTEMPTS);

        AccountEmailOtp otp = loadOtp(otpId);
        assertThat(otp.getAttempts()).isEqualTo(5);
        assertThat(otp.isVerified()).isFalse();
    }

    /**
     * Terms not accepted: throws before checkAndIncrementAttempt is ever called.
     * The OTP record must be completely untouched (0 attempts, not consumed).
     */
    @Test
    void termsNotAccepted_failsBeforeOtpTouched() {
        UUID userId = saveUser();
        User user = loadUser(userId);
        String rawToken = saveInviteToken(userId);
        String otpId = saveOtp(userId, user.getEmail(), "111111", 0);

        assertThatThrownBy(() ->
                orgUserSetupService.complete(
                        buildRequest(rawToken, "111111", STRONG_PASSWORD, false)))
                .isInstanceOf(BusinessException.class)
                .extracting(ex -> ((BusinessException) ex).getErrorCode())
                .isEqualTo(ErrorCode.VALIDATION_FAILED);

        AccountEmailOtp otp = loadOtp(otpId);
        assertThat(otp.getAttempts()).isZero();
        assertThat(otp.isVerified()).isFalse();
    }

    /**
     * Weak password: throws before checkAndIncrementAttempt is ever called.
     * The OTP record must be completely untouched.
     */
    @Test
    void weakPassword_failsBeforeOtpTouched() {
        UUID userId = saveUser();
        User user = loadUser(userId);
        String rawToken = saveInviteToken(userId);
        String otpId = saveOtp(userId, user.getEmail(), "222222", 0);

        assertThatThrownBy(() ->
                orgUserSetupService.complete(
                        buildRequest(rawToken, "222222", "weakpassword", true)))
                .isInstanceOf(BusinessException.class)
                .extracting(ex -> ((BusinessException) ex).getErrorCode())
                .isEqualTo(ErrorCode.VALIDATION_FAILED);

        AccountEmailOtp otp = loadOtp(otpId);
        assertThat(otp.getAttempts()).isZero();
        assertThat(otp.isVerified()).isFalse();
    }

    /**
     * Token already used: setup is rejected immediately without touching the OTP.
     */
    @Test
    void alreadyUsedToken_rejectsImmediately() {
        UUID userId = saveUser();
        User user = loadUser(userId);
        String rawToken = saveInviteToken(userId);
        // Mark the token as already used
        tx.execute(s -> {
            tokenRepository.findByTokenHash(OrgUserSetupService.sha256(rawToken))
                    .ifPresent(t -> {
                        t.setUsedAt(LocalDateTime.now().minusHours(1));
                        tokenRepository.save(t);
                    });
            return null;
        });
        String otpId = saveOtp(userId, user.getEmail(), "333333", 0);

        assertThatThrownBy(() ->
                orgUserSetupService.complete(
                        buildRequest(rawToken, "333333", STRONG_PASSWORD, true)))
                .isInstanceOf(BusinessException.class)
                .extracting(ex -> ((BusinessException) ex).getErrorCode())
                .isEqualTo(ErrorCode.TOKEN_INVALID);

        AccountEmailOtp otp = loadOtp(otpId);
        assertThat(otp.getAttempts()).isZero();
        assertThat(otp.isVerified()).isFalse();
    }

    /**
     * Expired token: setup is rejected immediately without touching the OTP.
     */
    @Test
    void expiredToken_rejectsImmediately() {
        UUID userId = saveUser();
        User user = loadUser(userId);
        // Create an expired invite token directly
        String rawToken = UUID.randomUUID().toString();
        tx.execute(s -> tokenRepository.save(AccountSetupToken.builder()
                .userId(userId)
                .purpose(SetupTokenPurpose.ORG_USER_INVITE)
                .tokenHash(OrgUserSetupService.sha256(rawToken))
                .expiresAt(LocalDateTime.now().minusHours(1))
                .build()));
        String otpId = saveOtp(userId, user.getEmail(), "444444", 0);

        assertThatThrownBy(() ->
                orgUserSetupService.complete(
                        buildRequest(rawToken, "444444", STRONG_PASSWORD, true)))
                .isInstanceOf(BusinessException.class)
                .extracting(ex -> ((BusinessException) ex).getErrorCode())
                .isEqualTo(ErrorCode.TOKEN_INVALID);

        AccountEmailOtp otp = loadOtp(otpId);
        assertThat(otp.getAttempts()).isZero();
        assertThat(otp.isVerified()).isFalse();
    }

    /**
     * Two concurrent complete() calls with the same valid OTP and token:
     * exactly one succeeds; the other fails (either wrong-OTP after first consumes
     * it, or TOKEN_INVALID / BusinessException from the pessimistic lock on the token).
     * After the dust settles there must be exactly one consumed OTP and zero active tokens.
     */
    @Test
    void twoSimultaneousCompletions_exactlyOneSucceeds() throws Exception {
        UUID userId = saveUser();
        User user = loadUser(userId);
        String rawToken = saveInviteToken(userId);
        String otpCode = "555555";
        saveOtp(userId, user.getEmail(), otpCode, 0);

        int threads = 2;
        ExecutorService pool = Executors.newFixedThreadPool(threads);
        CountDownLatch start = new CountDownLatch(1);
        AtomicInteger successes = new AtomicInteger(0);
        AtomicInteger failures = new AtomicInteger(0);

        List<Future<?>> futures = new ArrayList<>();
        for (int i = 0; i < threads; i++) {
            futures.add(pool.submit(() -> {
                try {
                    start.await();
                    orgUserSetupService.complete(
                            buildRequest(rawToken, otpCode, STRONG_PASSWORD, true));
                    successes.incrementAndGet();
                } catch (Exception e) {
                    failures.incrementAndGet();
                } catch (Throwable ignored) {}
            }));
        }
        start.countDown();
        for (Future<?> f : futures) f.get(20, TimeUnit.SECONDS);
        pool.shutdown();

        assertThat(successes.get()).isEqualTo(1);
        assertThat(failures.get()).isEqualTo(1);

        // Exactly one OTP record was consumed
        Long consumedCount = jdbc.queryForObject(
                "SELECT COUNT(*) FROM account_email_otps WHERE verified = 1",
                Long.class);
        assertThat(consumedCount).isEqualTo(1);

        // No active invite tokens remain
        Long activeTokens = jdbc.queryForObject(
                "SELECT COUNT(*) FROM account_setup_tokens WHERE user_id = ? " +
                "AND purpose = 'ORG_USER_INVITE' AND used_at IS NULL",
                Long.class, userId.toString());
        assertThat(activeTokens).isZero();
    }
}
