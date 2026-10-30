package com.chitfund.paymentservice.kafka;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.containers.MySQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * MySQL 8 integration tests for {@link PaymentOutboxStore}.
 *
 * These tests exercise PaymentOutboxStore.enqueue() directly against a real InnoDB
 * instance with Flyway-applied migrations. They do NOT invoke PaymentIntimationService,
 * PaymentService, or PaymentEventPublisher. In the live approval path, PaymentEventPublisher
 * generates a fresh random UUID as the event_id — it is not derived from the idempotency key.
 *
 * What these tests prove:
 *  - enqueue() inserts one row per destination, status PENDING, with the correct tenant_id
 *  - the unique constraint uq_outbox_event_destination(event_id, destination) prevents any
 *    caller from inserting the same (event_id, destination) pair twice at the DB level
 *  - a rolled-back transaction leaves no outbox rows
 */
@Testcontainers(disabledWithoutDocker = true)
class PaymentOutboxStoreMySqlTest {

    @Container
    static final MySQLContainer<?> MYSQL = new MySQLContainer<>("mysql:8.0")
            .withCommand("--log-bin-trust-function-creators=1")
            .withDatabaseName("chitfund_payments")
            .withUsername("chitfund")
            .withPassword("testpassword");

    // ── enqueue writes one PENDING row per destination ────────────────────────

    @Test
    void enqueueWritesOnePendingRowPerDestination() {
        JdbcTemplate jdbc = migrated();
        PaymentOutboxStore store = new PaymentOutboxStore(jdbc);
        String eventId  = UUID.randomUUID().toString();
        String tenantId = UUID.randomUUID().toString();
        List<String> destinations = List.of("NOTIFICATION_EVENTS", "AUDIT_EVENTS");

        tx(jdbc).executeWithoutResult(status ->
                store.enqueue(eventId, tenantId, "PAYMENT_BATCH", UUID.randomUUID().toString(),
                        "PAYMENT_COMPLETED", "{}", destinations));

        for (String dest : destinations) {
            assertThat(jdbc.queryForObject(
                    "SELECT COUNT(*) FROM event_outbox WHERE event_id=? AND destination=?",
                    Integer.class, eventId, dest)).isEqualTo(1);
        }
        assertThat(jdbc.queryForObject(
                "SELECT status FROM event_outbox WHERE event_id=? AND destination=?",
                String.class, eventId, "NOTIFICATION_EVENTS")).isEqualTo("PENDING");
    }

    // ── unique constraint blocks duplicate (event_id, destination) at the DB level ──

    @Test
    void duplicateEventIdAndDestinationIsRejectedByUniqueConstraint() {
        JdbcTemplate jdbc = migrated();
        PaymentOutboxStore store = new PaymentOutboxStore(jdbc);
        String eventId  = UUID.randomUUID().toString();
        String tenantId = UUID.randomUUID().toString();
        List<String> destinations = List.of("NOTIFICATION_EVENTS");

        tx(jdbc).executeWithoutResult(status ->
                store.enqueue(eventId, tenantId, "PAYMENT_BATCH", UUID.randomUUID().toString(),
                        "PAYMENT_COMPLETED", "{}", destinations));

        // A second enqueue for the same (event_id, destination) violates the unique constraint
        // uq_outbox_event_destination regardless of how the event_id was originally generated.
        assertThatThrownBy(() ->
                tx(jdbc).executeWithoutResult(status ->
                        store.enqueue(eventId, tenantId, "PAYMENT_BATCH",
                                UUID.randomUUID().toString(), "PAYMENT_COMPLETED", "{}",
                                destinations)))
                .isInstanceOf(Exception.class);

        assertThat(jdbc.queryForObject(
                "SELECT COUNT(*) FROM event_outbox WHERE event_id=? AND destination=?",
                Integer.class, eventId, "NOTIFICATION_EVENTS")).isEqualTo(1);
    }

    // ── rolled-back transaction leaves no outbox row ──────────────────────────

    @Test
    void rolledBackTransactionLeavesNoOutboxRow() {
        JdbcTemplate jdbc = migrated();
        PaymentOutboxStore store = new PaymentOutboxStore(jdbc);
        String eventId  = UUID.randomUUID().toString();
        String tenantId = UUID.randomUUID().toString();

        // setRollbackOnly() completes normally; any unexpected exception must fail the test.
        tx(jdbc).executeWithoutResult(status -> {
            store.enqueue(eventId, tenantId, "PAYMENT_BATCH",
                    UUID.randomUUID().toString(), "PAYMENT_COMPLETED", "{}",
                    List.of("NOTIFICATION_EVENTS"));
            status.setRollbackOnly();
        });

        assertThat(jdbc.queryForObject(
                "SELECT COUNT(*) FROM event_outbox WHERE event_id=?",
                Integer.class, eventId)).isZero();
    }

    // ── outbox row preserves tenant_id for relay delivery ─────────────────────

    @Test
    void outboxRowPreservesTenantIdForRelayDelivery() {
        JdbcTemplate jdbc = migrated();
        PaymentOutboxStore store = new PaymentOutboxStore(jdbc);
        String eventId  = UUID.randomUUID().toString();
        String tenantId = UUID.randomUUID().toString();

        tx(jdbc).executeWithoutResult(status ->
                store.enqueue(eventId, tenantId, "PAYMENT_BATCH", UUID.randomUUID().toString(),
                        "PAYMENT_COMPLETED", "{}", List.of("NOTIFICATION_EVENTS")));

        assertThat(jdbc.queryForObject(
                "SELECT tenant_id FROM event_outbox WHERE event_id=?",
                String.class, eventId)).isEqualTo(tenantId);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private JdbcTemplate migrated() {
        DriverManagerDataSource ds = new DriverManagerDataSource(
                MYSQL.getJdbcUrl(), MYSQL.getUsername(), MYSQL.getPassword());
        Flyway.configure().dataSource(ds).locations("classpath:db/migration")
                .load().migrate();
        return new JdbcTemplate(ds);
    }

    private TransactionTemplate tx(JdbcTemplate jdbc) {
        return new TransactionTemplate(
                new DataSourceTransactionManager(jdbc.getDataSource()));
    }
}
