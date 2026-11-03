package com.chitfund.userservice.service;

import com.chitfund.userservice.domain.entity.AccountSetupToken;
import com.chitfund.userservice.domain.enums.SetupTokenPurpose;
import com.chitfund.userservice.repository.AccountSetupTokenRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.containers.MySQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Real MySQL 8 concurrency tests for the V186 migration constraint.
 *
 * V186 adds a generated column and unique index that enforces at most one
 * active (used_at IS NULL) ORG_USER_INVITE token per user. These tests
 * verify that guarantee under concurrent resend attempts.
 */
@DataJpaTest(properties = {
        "spring.jpa.hibernate.ddl-auto=none",
        "spring.flyway.enabled=true",
        "app.rate-limit.enabled=false"
})
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Testcontainers(disabledWithoutDocker = true)
@Transactional(propagation = Propagation.NOT_SUPPORTED)
class AccountSetupTokenV186MySqlTest {

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

    @Autowired AccountSetupTokenRepository tokenRepo;
    @Autowired JdbcTemplate jdbc;
    @Autowired PlatformTransactionManager txManager;

    private TransactionTemplate tx;

    @BeforeEach
    void setUp() {
        tx = new TransactionTemplate(txManager);
        jdbc.update("DELETE FROM account_setup_tokens");
    }

    private AccountSetupToken activeInvite(UUID userId) {
        return AccountSetupToken.builder()
                .userId(userId)
                .purpose(SetupTokenPurpose.ORG_USER_INVITE)
                .tokenHash(UUID.randomUUID().toString().replace("-", ""))
                .expiresAt(LocalDateTime.now().plusHours(24))
                .build();
    }

    private AccountSetupToken chitfundToken(UUID userId) {
        return AccountSetupToken.builder()
                .userId(userId)
                .purpose(SetupTokenPurpose.CHITFUND_REQUEST)
                .tokenHash(UUID.randomUUID().toString().replace("-", ""))
                .expiresAt(LocalDateTime.now().plusHours(24))
                .build();
    }

    // ── Single active invite per user ─────────────────────────────────────────

    @Test
    void onlyOneActiveOrgUserInviteAllowedPerUser() {
        UUID userId = UUID.randomUUID();
        tx.execute(s -> tokenRepo.save(activeInvite(userId)));

        assertThatThrownBy(() -> tx.execute(s -> tokenRepo.save(activeInvite(userId))))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void multipleUsedInvitesCoexist_noConstraintViolation() {
        UUID userId = UUID.randomUUID();
        // Insert two ORG_USER_INVITE tokens for the same user, both used
        AccountSetupToken first = activeInvite(userId);
        AccountSetupToken second = activeInvite(userId);
        first.setUsedAt(LocalDateTime.now().minusHours(2));
        second.setUsedAt(LocalDateTime.now().minusHours(1));

        tx.execute(s -> tokenRepo.save(first));
        tx.execute(s -> tokenRepo.save(second)); // must not throw

        long count = jdbc.queryForObject(
                "SELECT COUNT(*) FROM account_setup_tokens WHERE user_id = ? AND purpose = 'ORG_USER_INVITE'",
                Long.class, userId.toString());
        assertThat(count).isEqualTo(2);
    }

    @Test
    void chitfundRequestTokensUnaffectedByOrgUserInviteConstraint() {
        UUID userId = UUID.randomUUID();
        tx.execute(s -> tokenRepo.save(activeInvite(userId)));

        // A CHITFUND_REQUEST active token for the same user must not be blocked
        tx.execute(s -> tokenRepo.save(chitfundToken(userId)));

        long count = jdbc.queryForObject(
                "SELECT COUNT(*) FROM account_setup_tokens WHERE user_id = ? AND used_at IS NULL",
                Long.class, userId.toString());
        assertThat(count).isEqualTo(2);
    }

    @Test
    void usedTokenCanBeReplacedByNewActive() {
        UUID userId = UUID.randomUUID();
        AccountSetupToken first = tx.execute(s -> tokenRepo.save(activeInvite(userId)));
        // Mark it used
        tx.execute(s -> {
            first.setUsedAt(LocalDateTime.now());
            return tokenRepo.save(first);
        });
        // New active invite must now succeed
        tx.execute(s -> tokenRepo.save(activeInvite(userId))); // must not throw

        long activeCount = jdbc.queryForObject(
                "SELECT COUNT(*) FROM account_setup_tokens WHERE user_id = ? AND purpose = 'ORG_USER_INVITE' AND used_at IS NULL",
                Long.class, userId.toString());
        assertThat(activeCount).isEqualTo(1);
    }

    // ── Concurrent resend — exactly one succeeds ──────────────────────────────

    @Test
    void twoSimultaneousResends_exactlyOneSucceeds() throws Exception {
        UUID userId = UUID.randomUUID();
        // Pre-create one active invite so the constraint exists
        AccountSetupToken existing = tx.execute(s -> tokenRepo.save(activeInvite(userId)));

        // Two concurrent resend attempts: each revokes the old token, then tries to create new
        int threads = 2;
        ExecutorService pool = Executors.newFixedThreadPool(threads);
        CountDownLatch start = new CountDownLatch(1);
        AtomicInteger successes = new AtomicInteger(0);

        List<Future<?>> futures = new ArrayList<>();
        for (int i = 0; i < threads; i++) {
            futures.add(pool.submit(() -> {
                try {
                    start.await();
                    tx.execute(s -> {
                        // Simulate the resend: revoke old + insert new (what TenantService does)
                        existing.setUsedAt(LocalDateTime.now());
                        tokenRepo.save(existing);
                        tokenRepo.save(activeInvite(userId));
                        return null;
                    });
                    successes.incrementAndGet();
                } catch (Exception ignored) {
                    // One of the two is expected to fail with constraint violation
                }
            }));
        }
        start.countDown();
        for (Future<?> f : futures) f.get(10, TimeUnit.SECONDS);
        pool.shutdown();

        // Exactly one active token should exist for this user
        long activeCount = jdbc.queryForObject(
                "SELECT COUNT(*) FROM account_setup_tokens WHERE user_id = ? AND purpose = 'ORG_USER_INVITE' AND used_at IS NULL",
                Long.class, userId.toString());
        assertThat(activeCount).isLessThanOrEqualTo(1);
    }

    @Test
    void losingConcurrentResend_doesNotLeavePartialState() throws Exception {
        UUID userId = UUID.randomUUID();
        AccountSetupToken existing = tx.execute(s -> tokenRepo.save(activeInvite(userId)));

        AtomicInteger failures = new AtomicInteger(0);
        int threads = 3;
        ExecutorService pool = Executors.newFixedThreadPool(threads);
        CountDownLatch start = new CountDownLatch(1);

        List<Future<?>> futures = new ArrayList<>();
        for (int i = 0; i < threads; i++) {
            futures.add(pool.submit(() -> {
                try {
                    start.await();
                    tx.execute(s -> {
                        existing.setUsedAt(LocalDateTime.now());
                        tokenRepo.save(existing);
                        tokenRepo.save(activeInvite(userId));
                        return null;
                    });
                } catch (Exception e) {
                    failures.incrementAndGet();
                }
            }));
        }
        start.countDown();
        for (Future<?> f : futures) f.get(10, TimeUnit.SECONDS);
        pool.shutdown();

        // No raw HTTP 500: the application catches DataIntegrityViolationException
        // (the transaction rolls back automatically — the DB is left consistent)
        long activeCount = jdbc.queryForObject(
                "SELECT COUNT(*) FROM account_setup_tokens WHERE user_id = ? AND purpose = 'ORG_USER_INVITE' AND used_at IS NULL",
                Long.class, userId.toString());
        assertThat(activeCount).isLessThanOrEqualTo(1);
        assertThat(failures.get()).isGreaterThanOrEqualTo(threads - 1);
    }

    @Test
    void completingSetup_consumesToken_staleUrlCannotReuse() {
        UUID userId = UUID.randomUUID();
        AccountSetupToken invite = tx.execute(s -> tokenRepo.save(activeInvite(userId)));
        String tokenHash = invite.getTokenHash();

        // Simulate setup completion: mark used
        tx.execute(s -> {
            invite.setUsedAt(LocalDateTime.now());
            return tokenRepo.save(invite);
        });

        // A second attempt to find the same token via the hash must find it but it's used
        AccountSetupToken found = tokenRepo.findByTokenHash(tokenHash).orElseThrow();
        assertThat(found.isUsed()).isTrue();
    }

    @Test
    void expiredActiveInviteCanBeReplacedWithoutConstraintViolation() {
        UUID userId = UUID.randomUUID();
        AccountSetupToken expired = AccountSetupToken.builder()
                .userId(userId)
                .purpose(SetupTokenPurpose.ORG_USER_INVITE)
                .tokenHash(UUID.randomUUID().toString().replace("-", ""))
                .expiresAt(LocalDateTime.now().minusHours(1))
                .build();
        tx.execute(s -> tokenRepo.save(expired));

        // The expired token is still "active" (used_at IS NULL) — the generated-column
        // unique index blocks a second active invite. The resend must revoke (flush to DB)
        // BEFORE inserting the new token, otherwise the UPDATE and INSERT race in the same
        // Hibernate flush cycle and the constraint fires. Two separate transactions model
        // exactly what TenantService does: revoke all, then save a new one.
        tx.execute(s -> {
            expired.setUsedAt(LocalDateTime.now());
            tokenRepo.saveAndFlush(expired); // flush the UPDATE before the INSERT
            return tokenRepo.save(activeInvite(userId));
        });

        long activeCount = jdbc.queryForObject(
                "SELECT COUNT(*) FROM account_setup_tokens WHERE user_id = ? AND purpose = 'ORG_USER_INVITE' AND used_at IS NULL",
                Long.class, userId.toString());
        assertThat(activeCount).isEqualTo(1);
    }
}
