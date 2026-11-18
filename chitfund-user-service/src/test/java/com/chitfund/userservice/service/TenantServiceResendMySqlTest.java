package com.chitfund.userservice.service;

import com.chitfund.common.exception.BusinessException;
import com.chitfund.common.outbox.DurableAuditOutbox;
import com.chitfund.common.outbox.DurableEventOutbox;
import com.chitfund.userservice.client.AuditClient;
import com.chitfund.userservice.domain.entity.AccountSetupToken;
import com.chitfund.userservice.domain.entity.Tenant;
import com.chitfund.userservice.domain.entity.User;
import com.chitfund.userservice.domain.enums.Role;
import com.chitfund.userservice.domain.enums.SetupTokenPurpose;
import com.chitfund.userservice.event.NotificationEventPublisher;
import com.chitfund.userservice.repository.AccountSetupTokenRepository;
import com.chitfund.userservice.repository.TenantRepository;
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
import org.springframework.http.HttpStatus;
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

/**
 * Real MySQL 8 integration tests for TenantService.resendOrgUserSetup().
 *
 * Tests exercise the production service method against a real database to
 * verify the saveAllAndFlush + pessimistic-lock + DataIntegrityViolationException
 * fix prevents duplicate active ORG_USER_INVITE tokens under concurrent resends.
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
        TenantServiceResendMySqlTest.Config.class,
        PromotionService.class,
        PlanService.class,
        TenantService.class
})
class TenantServiceResendMySqlTest {

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
        PasswordEncoder passwordEncoder() { return new BCryptPasswordEncoder(); }

        @Bean
        ObjectMapper objectMapper() { return new ObjectMapper(); }

        @Bean
        DurableEventOutbox durableEventOutbox(JdbcTemplate jdbc) {
            return new DurableEventOutbox(jdbc);
        }

        @Bean
        DurableAuditOutbox durableAuditOutbox(JdbcTemplate jdbc) {
            return new DurableAuditOutbox(jdbc);
        }

        @Bean
        NotificationEventPublisher notificationEventPublisher(
                DurableEventOutbox outbox, ObjectMapper mapper) {
            return new NotificationEventPublisher(outbox, mapper);
        }

        @Bean
        AuditClient auditClient(DurableAuditOutbox outbox, ObjectMapper mapper) {
            return new AuditClient(outbox, mapper);
        }
    }

    @Autowired TenantService tenantService;
    @Autowired TenantRepository tenantRepository;
    @Autowired UserRepository userRepository;
    @Autowired AccountSetupTokenRepository tokenRepository;
    @Autowired JdbcTemplate jdbc;
    @Autowired PlatformTransactionManager txManager;

    private TransactionTemplate tx;

    @BeforeEach
    void setUp() {
        tx = new TransactionTemplate(txManager);
        jdbc.update("DELETE FROM domain_event_outbox");
        jdbc.update("DELETE FROM audit_event_outbox");
        jdbc.update("DELETE FROM account_setup_tokens");
        jdbc.update("DELETE FROM users");
        jdbc.update("DELETE FROM tenants");
    }

    private UUID createTenant() {
        return tx.execute(s -> {
            Tenant t = Tenant.builder()
                    .name("Test Org " + UUID.randomUUID())
                    .slug("test-" + UUID.randomUUID().toString().replace("-", "").substring(0, 8))
                    .contactEmail("admin@test.example")
                    .build();
            return tenantRepository.save(t).getId();
        });
    }

    private UUID createOrgUser(UUID tenantId) {
        return tx.execute(s -> {
            User u = User.builder()
                    .username("orguser-" + UUID.randomUUID().toString().replace("-", "").substring(0, 8))
                    .email("orguser-" + UUID.randomUUID() + "@test.example")
                    .fullName("Test User")
                    .passwordHash("$2a$10$placeholder")
                    .role(Role.MANAGER)
                    .tenantId(tenantId.toString())
                    .build();
            return userRepository.save(u).getId();
        });
    }

    private UUID createActivatedOrgUser(UUID tenantId) {
        return tx.execute(s -> {
            User u = User.builder()
                    .username("orguser-" + UUID.randomUUID().toString().replace("-", "").substring(0, 8))
                    .email("orguser-" + UUID.randomUUID() + "@test.example")
                    .fullName("Activated User")
                    .passwordHash("$2a$10$placeholder")
                    .role(Role.MANAGER)
                    .tenantId(tenantId.toString())
                    .orgUserSetupCompletedAt(LocalDateTime.now())
                    .build();
            return userRepository.save(u).getId();
        });
    }

    private String createActiveInvite(UUID userId) {
        String hash = tx.execute(s -> {
            AccountSetupToken token = AccountSetupToken.builder()
                    .userId(userId)
                    .purpose(SetupTokenPurpose.ORG_USER_INVITE)
                    .tokenHash(UUID.randomUUID().toString().replace("-", ""))
                    .expiresAt(LocalDateTime.now().plusHours(72))
                    .build();
            return tokenRepository.save(token).getTokenHash();
        });
        // Back-date created_at so the freshness guard (30s window) does not treat this
        // initial invite as a "just-resent" token. Resend tests verify replacement logic,
        // not the freshness guard (which is tested by twoSimultaneousResends_*).
        jdbc.update("UPDATE account_setup_tokens SET created_at = ? WHERE token_hash = ?",
                LocalDateTime.now().minusMinutes(2), hash);
        return hash;
    }

    private int countOutboxEmails() {
        Integer count = jdbc.queryForObject(
                "SELECT COUNT(*) FROM domain_event_outbox WHERE event_type = 'TRANSACTIONAL_EMAIL'",
                Integer.class);
        return count == null ? 0 : count;
    }

    // ── Core fix: saveAllAndFlush prevents V186 constraint violation ──────────

    @Test
    void resend_revokesOldToken_insertsNewToken() {
        UUID tenantId = createTenant();
        UUID userId = createOrgUser(tenantId);
        String originalHash = createActiveInvite(userId);

        tenantService.resendOrgUserSetup(tenantId, userId, "actor-1");

        // Exactly one active token remains
        Long active = jdbc.queryForObject(
                "SELECT COUNT(*) FROM account_setup_tokens WHERE user_id = ? " +
                "AND purpose = 'ORG_USER_INVITE' AND used_at IS NULL",
                Long.class, userId.toString());
        assertThat(active).isEqualTo(1);

        // The surviving token is a NEW one — not the original
        String newHash = jdbc.queryForObject(
                "SELECT token_hash FROM account_setup_tokens WHERE user_id = ? " +
                "AND purpose = 'ORG_USER_INVITE' AND used_at IS NULL",
                String.class, userId.toString());
        assertThat(newHash).isNotEqualTo(originalHash);

        // Original token is revoked
        Long originalActive = jdbc.queryForObject(
                "SELECT COUNT(*) FROM account_setup_tokens WHERE token_hash = ? AND used_at IS NULL",
                Long.class, originalHash);
        assertThat(originalActive).isZero();

        // Exactly one email event was queued
        assertThat(countOutboxEmails()).isEqualTo(1);
    }

    @Test
    void resend_rejectsActivatedAccount() {
        UUID tenantId = createTenant();
        // createActivatedOrgUser sets orgUserSetupCompletedAt — the authoritative completion signal
        UUID userId = createActivatedOrgUser(tenantId);

        org.assertj.core.api.Assertions.assertThatThrownBy(
                () -> tenantService.resendOrgUserSetup(tenantId, userId, "actor"))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getHttpStatus())
                        .isEqualTo(HttpStatus.CONFLICT));

        // No email sent
        assertThat(countOutboxEmails()).isZero();
    }

    // ── Concurrency: freshness guard deduplicates rapid back-to-back resends ─────

    @Test
    void twoSimultaneousResends_exactlyOneEmailSent() throws Exception {
        UUID tenantId = createTenant();
        UUID userId = createOrgUser(tenantId);
        String originalHash = createActiveInvite(userId);
        int emailsBefore = countOutboxEmails();

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
                    tenantService.resendOrgUserSetup(tenantId, userId, "actor");
                    successes.incrementAndGet();
                } catch (Exception e) {
                    failures.incrementAndGet();
                }
            }));
        }
        start.countDown();
        for (Future<?> f : futures) f.get(15, TimeUnit.SECONDS);
        pool.shutdown();

        // Freshness guard: the second serialised request sees the fresh token and returns
        // idempotently. Both calls return without throwing — one created, one skipped.
        assertThat(failures.get()).isZero();

        // Exactly one active token for this user
        Long activeCount = jdbc.queryForObject(
                "SELECT COUNT(*) FROM account_setup_tokens WHERE user_id = ? " +
                "AND purpose = 'ORG_USER_INVITE' AND used_at IS NULL",
                Long.class, userId.toString());
        assertThat(activeCount).isEqualTo(1);

        // The surviving token is a new one — not the original (original was revoked by the winner)
        String survivingHash = jdbc.queryForObject(
                "SELECT token_hash FROM account_setup_tokens WHERE user_id = ? " +
                "AND purpose = 'ORG_USER_INVITE' AND used_at IS NULL",
                String.class, userId.toString());
        assertThat(survivingHash).isNotEqualTo(originalHash);

        // Original token is revoked
        Long originalStillActive = jdbc.queryForObject(
                "SELECT COUNT(*) FROM account_setup_tokens WHERE token_hash = ? AND used_at IS NULL",
                Long.class, originalHash);
        assertThat(originalStillActive).isZero();

        // Exactly ONE email was queued — the idempotent second call skipped the email
        int emailsAfter = countOutboxEmails();
        assertThat(emailsAfter - emailsBefore).isEqualTo(1);
    }
}
