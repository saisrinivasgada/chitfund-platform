package com.chitfund.userservice.outbox;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.containers.MySQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import javax.sql.DataSource;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * MySQL 8 integration test for V180 generated-column resend guard.
 * Verifies that SUPERSEDED/COMPLETED rows do not block new PENDING rows
 * for the same request_id, enabling safe resend with delivery history preserved.
 *
 * NOTE: The outbox provides at-least-once delivery semantics. A crash after
 * SES accepts but before DB commit may cause a duplicate email. This is
 * acceptable because generateSetupToken() invalidates prior tokens on each
 * new call, so every delivered link is valid and older links are revoked.
 */
@Testcontainers(disabledWithoutDocker = true)
class SetupEmailOutboxMySqlTest {

    @Container
    static final MySQLContainer<?> MYSQL = new MySQLContainer<>("mysql:8.0")
            .withDatabaseName("chitfund_users")
            .withUsername("chitfund")
            .withPassword("testpassword");

    private DataSource dataSource;
    private JdbcTemplate jdbc;
    private SetupEmailOutbox outbox;
    private TransactionTemplate transactions;

    @BeforeEach
    void setUp() {
        DriverManagerDataSource ds = new DriverManagerDataSource(
                MYSQL.getJdbcUrl(), MYSQL.getUsername(), MYSQL.getPassword());
        Flyway.configure().dataSource(ds).locations("classpath:db/migration").load().migrate();
        this.dataSource = ds;
        this.jdbc = new JdbcTemplate(ds);
        this.outbox = new SetupEmailOutbox(jdbc);
        this.transactions = new TransactionTemplate(new DataSourceTransactionManager(ds));

        // clean slate between tests
        jdbc.update("DELETE FROM setup_email_outbox");
        jdbc.update("DELETE FROM chitfund_access_requests");
    }

    // ──────────────────────────────────────────────────────────────
    // helpers
    // ──────────────────────────────────────────────────────────────

    private UUID insertRequest(UUID requestId, UUID candidateUserId) {
        UUID tenantId = UUID.randomUUID();
        UUID memberId = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO chitfund_access_requests
                    (id, tenant_id, member_id, requested_phone, phone_country_code,
                     candidate_user_id, request_kind, status, expires_at, last_sent_at,
                     setup_email_status, version, created_at, updated_at)
                VALUES (?,?,?,?,?,?,?,?,DATE_ADD(NOW(), INTERVAL 1 DAY),NOW(),
                        'PENDING', 0, NOW(), NOW())
                """,
                requestId.toString(), tenantId.toString(), memberId.toString(),
                "+919999000001", "+91",
                candidateUserId.toString(), "CHITFUND_MEMBER_SETUP", "PENDING_MEMBER");
        return requestId;
    }

    private SetupEmailCommand enqueueAndClaim(UUID requestId, UUID candidateUserId) {
        outbox.enqueue(requestId, candidateUserId, "test@example.com", "Test User", "TestOrg");
        var batch = outbox.claimBatch(1, java.time.Duration.ofMinutes(5));
        assertThat(batch).hasSize(1);
        return batch.get(0);
    }

    private String outboxStatus(String deliveryId) {
        return jdbc.queryForObject(
                "SELECT status FROM setup_email_outbox WHERE delivery_id=?",
                String.class, deliveryId);
    }

    private String requestEmailStatus(UUID requestId) {
        return jdbc.queryForObject(
                "SELECT setup_email_status FROM chitfund_access_requests WHERE id=?",
                String.class, requestId.toString());
    }

    // ──────────────────────────────────────────────────────────────
    // tests
    // ──────────────────────────────────────────────────────────────

    @Test
    void enqueue_createsOnePendingRow() {
        UUID requestId = UUID.randomUUID();
        UUID candidateUserId = UUID.randomUUID();
        insertRequest(requestId, candidateUserId);

        outbox.enqueue(requestId, candidateUserId, "a@b.com", "Alice", "Org");

        assertThat(outbox.countByStatus("PENDING")).isEqualTo(1);
    }

    @Test
    void markCompletedAndDelivered_atomicallyUpdatesOutboxAndRequest() {
        UUID requestId = UUID.randomUUID();
        UUID candidateUserId = UUID.randomUUID();
        insertRequest(requestId, candidateUserId);

        SetupEmailCommand cmd = enqueueAndClaim(requestId, candidateUserId);

        boolean updated = transactions.execute(status -> outbox.markCompletedAndDelivered(cmd));

        assertThat(updated).isTrue();
        assertThat(outboxStatus(cmd.deliveryId())).isEqualTo("COMPLETED");
        assertThat(requestEmailStatus(requestId)).isEqualTo("SENT");
    }

    @Test
    void completionRollsBackWhenRequestStateCannotBeFinalized() {
        UUID requestId = UUID.randomUUID();
        UUID candidateUserId = UUID.randomUUID();
        insertRequest(requestId, candidateUserId);
        SetupEmailCommand cmd = enqueueAndClaim(requestId, candidateUserId);
        jdbc.update("UPDATE chitfund_access_requests SET setup_email_status='UNAVAILABLE' WHERE id=?",
                requestId.toString());

        assertThatThrownBy(() -> transactions.executeWithoutResult(
                status -> outbox.markCompletedAndDelivered(cmd)))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("not finalizable");

        assertThat(outboxStatus(cmd.deliveryId())).isEqualTo("IN_FLIGHT");
        assertThat(requestEmailStatus(requestId)).isEqualTo("UNAVAILABLE");
    }

    @Test
    void resend_createsNewPendingAfterCompleted() {
        UUID requestId = UUID.randomUUID();
        UUID candidateUserId = UUID.randomUUID();
        insertRequest(requestId, candidateUserId);

        // first delivery
        SetupEmailCommand first = enqueueAndClaim(requestId, candidateUserId);
        transactions.executeWithoutResult(status -> outbox.markCompletedAndDelivered(first));

        // resend: supersede (no-op since already COMPLETED) then enqueue new row
        transactions.executeWithoutResult(status -> {
            jdbc.update("UPDATE chitfund_access_requests SET setup_email_status='PENDING', "
                    + "setup_email_sent_at=NULL WHERE id=?", requestId.toString());
            outbox.supersede(requestId);
            outbox.enqueue(requestId, candidateUserId, "a@b.com", "Alice", "Org");
        });

        assertThat(outbox.countByStatus("COMPLETED")).isEqualTo(1);
        assertThat(outbox.countByStatus("PENDING")).isEqualTo(1);

        // new delivery can be claimed and completed
        SetupEmailCommand second = outbox.claimBatch(1, java.time.Duration.ofMinutes(5)).get(0);
        assertThat(second.deliveryId()).isNotEqualTo(first.deliveryId());
        boolean ok = transactions.execute(status -> outbox.markCompletedAndDelivered(second));
        assertThat(ok).isTrue();
    }

    @Test
    void supersede_beforeEnqueue_allowsNewActiveRow() {
        UUID requestId = UUID.randomUUID();
        UUID candidateUserId = UUID.randomUUID();
        insertRequest(requestId, candidateUserId);

        outbox.enqueue(requestId, candidateUserId, "a@b.com", "Alice", "Org");
        assertThat(outbox.countByStatus("PENDING")).isEqualTo(1);

        // supersede the PENDING row, then enqueue a replacement
        transactions.executeWithoutResult(status -> {
            outbox.supersede(requestId);
            outbox.enqueue(requestId, candidateUserId, "a@b.com", "Alice", "Org");
        });

        assertThat(outbox.countByStatus("PENDING")).isEqualTo(1);
        assertThat(outbox.countByStatus("SUPERSEDED")).isEqualTo(1);
    }

    @Test
    void concurrentActivePrevented_uniqueConstraintBlocksSecondPending() {
        UUID requestId = UUID.randomUUID();
        UUID candidateUserId = UUID.randomUUID();
        insertRequest(requestId, candidateUserId);

        outbox.enqueue(requestId, candidateUserId, "a@b.com", "Alice", "Org");

        // inserting a second PENDING row for the same request must fail
        assertThatThrownBy(() ->
                outbox.enqueue(requestId, candidateUserId, "a@b.com", "Alice", "Org"))
                .isInstanceOf(DuplicateKeyException.class);
    }

    @Test
    void markTerminalFailure_atomicallyUpdatesOutboxAndRequest() {
        UUID requestId = UUID.randomUUID();
        UUID candidateUserId = UUID.randomUUID();
        insertRequest(requestId, candidateUserId);

        SetupEmailCommand cmd = enqueueAndClaim(requestId, candidateUserId);
        java.time.LocalDateTime retryAt = java.time.LocalDateTime.now(java.time.ZoneOffset.UTC)
                .plusMinutes(5);

        boolean updated = transactions.execute(status ->
                outbox.markTerminalFailure(cmd, 5, retryAt, "SesException", "quota exceeded"));

        assertThat(updated).isTrue();
        assertThat(outboxStatus(cmd.deliveryId())).isEqualTo("FAILED");
        assertThat(requestEmailStatus(requestId)).isEqualTo("FAILED");
    }

    @Test
    void terminalFailureRollsBackWhenRequestStateCannotBeFinalized() {
        UUID requestId = UUID.randomUUID();
        UUID candidateUserId = UUID.randomUUID();
        insertRequest(requestId, candidateUserId);
        SetupEmailCommand cmd = enqueueAndClaim(requestId, candidateUserId);
        jdbc.update("UPDATE chitfund_access_requests SET setup_email_status='UNAVAILABLE' WHERE id=?",
                requestId.toString());
        java.time.LocalDateTime retryAt = java.time.LocalDateTime.now(java.time.ZoneOffset.UTC)
                .plusMinutes(5);

        assertThatThrownBy(() -> transactions.executeWithoutResult(status ->
                outbox.markTerminalFailure(cmd, 5, retryAt, "SesException", "quota exceeded")))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("not finalizable");

        assertThat(outboxStatus(cmd.deliveryId())).isEqualTo("IN_FLIGHT");
        assertThat(requestEmailStatus(requestId)).isEqualTo("UNAVAILABLE");
    }

    @Test
    void supersededRowDoesNotBlockResendAfterTerminalFailure() {
        UUID requestId = UUID.randomUUID();
        UUID candidateUserId = UUID.randomUUID();
        insertRequest(requestId, candidateUserId);

        // First attempt fails terminally
        SetupEmailCommand cmd = enqueueAndClaim(requestId, candidateUserId);
        java.time.LocalDateTime retryAt = java.time.LocalDateTime.now(java.time.ZoneOffset.UTC)
                .plusMinutes(5);
        transactions.executeWithoutResult(status ->
                outbox.markTerminalFailure(cmd, 5, retryAt, "Err", "msg"));

        // Admin triggers resend: supersede (no-op, already FAILED) + enqueue
        transactions.executeWithoutResult(status -> {
            outbox.supersede(requestId);
            outbox.enqueue(requestId, candidateUserId, "a@b.com", "Alice", "Org");
        });

        assertThat(outbox.countByStatus("PENDING")).isEqualTo(1);
        assertThat(outbox.countByStatus("FAILED")).isEqualTo(1);
    }
}
