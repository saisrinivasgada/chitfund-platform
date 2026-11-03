package com.chitfund.userservice.service;

import com.chitfund.userservice.domain.entity.AccountSetupToken;
import com.chitfund.userservice.domain.entity.User;
import com.chitfund.userservice.domain.enums.Role;
import com.chitfund.userservice.domain.enums.SetupTokenPurpose;
import com.chitfund.userservice.repository.AccountSetupTokenRepository;
import com.chitfund.userservice.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.testcontainers.containers.MySQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.time.LocalDateTime;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Real MySQL 8 tests for the isSetupPending() logic, which must derive
 * from an active (unused, unexpired) ORG_USER_INVITE token only.
 *
 * The old implementation used mustChangePassword || emailVerificationRequired,
 * which also fired during password-reset and email-change workflows — causing
 * false positives that would allow unnecessary setup resends for accounts that
 * are legitimately mid-password-reset.
 */
@DataJpaTest(properties = {
        "spring.jpa.hibernate.ddl-auto=none",
        "spring.flyway.enabled=true",
        "app.rate-limit.enabled=false"
})
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Testcontainers(disabledWithoutDocker = true)
@Transactional(propagation = Propagation.NOT_SUPPORTED)
class IsSetupPendingMySqlTest {

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

    @Autowired AccountSetupTokenRepository tokenRepository;
    @Autowired UserRepository userRepository;
    @Autowired PlatformTransactionManager txManager;

    private TransactionTemplate tx;

    @BeforeEach
    void setUp() {
        tx = new TransactionTemplate(txManager);
        tx.execute(s -> {
            tokenRepository.deleteAll();
            userRepository.deleteAll();
            return null;
        });
    }

    private UUID saveUser() {
        return tx.execute(s -> userRepository.save(User.builder()
                .username("u-" + UUID.randomUUID().toString().replace("-", "").substring(0, 8))
                .email("u-" + UUID.randomUUID() + "@test.example")
                .passwordHash("$2a$10$placeholder")
                .role(Role.MANAGER)
                .tenantId(UUID.randomUUID().toString())
                .build()).getId());
    }

    private void giveActiveInvite(UUID userId) {
        tx.execute(s -> tokenRepository.save(AccountSetupToken.builder()
                .userId(userId)
                .purpose(SetupTokenPurpose.ORG_USER_INVITE)
                .tokenHash(UUID.randomUUID().toString().replace("-", ""))
                .expiresAt(LocalDateTime.now().plusHours(72))
                .build()));
    }

    private void giveExpiredInvite(UUID userId) {
        tx.execute(s -> tokenRepository.save(AccountSetupToken.builder()
                .userId(userId)
                .purpose(SetupTokenPurpose.ORG_USER_INVITE)
                .tokenHash(UUID.randomUUID().toString().replace("-", ""))
                .expiresAt(LocalDateTime.now().minusHours(1))
                .build()));
    }

    private void giveUsedInvite(UUID userId) {
        tx.execute(s -> tokenRepository.save(AccountSetupToken.builder()
                .userId(userId)
                .purpose(SetupTokenPurpose.ORG_USER_INVITE)
                .tokenHash(UUID.randomUUID().toString().replace("-", ""))
                .expiresAt(LocalDateTime.now().plusHours(72))
                .usedAt(LocalDateTime.now().minusMinutes(5))
                .build()));
    }

    private boolean isSetupPending(UUID userId) {
        return tokenRepository.existsActiveOrgUserInvite(userId, LocalDateTime.now());
    }

    // ── Positive cases ────────────────────────────────────────────────────────

    @Test
    void newInvitedUser_isSetupPending() {
        UUID userId = saveUser();
        giveActiveInvite(userId);
        assertThat(isSetupPending(userId)).isTrue();
    }

    // ── Negative cases — no active invite ────────────────────────────────────

    @Test
    void completedUser_noActiveInvite_notSetupPending() {
        UUID userId = saveUser();
        giveUsedInvite(userId);
        assertThat(isSetupPending(userId)).isFalse();
    }

    @Test
    void expiredInvite_notSetupPending() {
        UUID userId = saveUser();
        giveExpiredInvite(userId);
        assertThat(isSetupPending(userId)).isFalse();
    }

    @Test
    void usedInvite_notSetupPending() {
        UUID userId = saveUser();
        giveUsedInvite(userId);
        assertThat(isSetupPending(userId)).isFalse();
    }

    @Test
    void noTokenAtAll_notSetupPending() {
        UUID userId = saveUser();
        assertThat(isSetupPending(userId)).isFalse();
    }

    // ── Critical: flags that fire during OTHER workflows must NOT make setupPending ──

    @Test
    void forcedPasswordChange_withoutActiveInvite_notSetupPending() {
        UUID userId = tx.execute(s -> userRepository.save(User.builder()
                .username("fpc-" + UUID.randomUUID().toString().replace("-", "").substring(0, 8))
                .email("fpc-" + UUID.randomUUID() + "@test.example")
                .passwordHash("$2a$10$placeholder")
                .role(Role.MANAGER)
                .tenantId(UUID.randomUUID().toString())
                .mustChangePassword(true)
                .build()).getId());
        // mustChangePassword=true alone (password-reset workflow) must NOT be setup pending
        assertThat(isSetupPending(userId)).isFalse();
    }

    @Test
    void emailVerificationRequired_withoutActiveInvite_notSetupPending() {
        UUID userId = tx.execute(s -> userRepository.save(User.builder()
                .username("evr-" + UUID.randomUUID().toString().replace("-", "").substring(0, 8))
                .email("evr-" + UUID.randomUUID() + "@test.example")
                .passwordHash("$2a$10$placeholder")
                .role(Role.MANAGER)
                .tenantId(UUID.randomUUID().toString())
                .emailVerificationRequired(true)
                .build()).getId());
        // emailVerificationRequired=true alone (email-change workflow) must NOT be setup pending
        assertThat(isSetupPending(userId)).isFalse();
    }

    @Test
    void lockedUser_withActiveInvite_isSetupPending() {
        UUID userId = tx.execute(s -> userRepository.save(User.builder()
                .username("lk-" + UUID.randomUUID().toString().replace("-", "").substring(0, 8))
                .email("lk-" + UUID.randomUUID() + "@test.example")
                .passwordHash("$2a$10$placeholder")
                .role(Role.MANAGER)
                .tenantId(UUID.randomUUID().toString())
                .locked(true)
                .build()).getId());
        giveActiveInvite(userId);
        // Setup is still pending for a locked user with an active invite
        assertThat(isSetupPending(userId)).isTrue();
    }

    @Test
    void crossTenantRequest_differentUser_notSetupPending() {
        UUID userA = saveUser();
        UUID userB = saveUser();
        giveActiveInvite(userA);
        // userB has no invite — checking for userB must return false even though userA has one
        assertThat(isSetupPending(userB)).isFalse();
    }
}
