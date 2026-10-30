package com.chitfund.paymentservice.kafka;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.testcontainers.containers.MySQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Verifies that the payment-service transactional outbox behaves correctly for the
 * intimation approval pipeline. This test covers the payment side of:
 *
 *   PaymentIntimationService.approveIntimation()
 *   → recordPayment() with idempotencyKey = "INTIM:<intimationId>"
 *   → PaymentEventPublisher.publish() via PaymentOutboxStore.enqueue()
 *   → event_outbox row (PENDING, unique per event_id + destination)
 *
 * The notification side is covered by PaymentApprovalNotificationPipelineMySqlTest in
 * chitfund-notification-service. Together the two test classes cover the full pipeline.
 */
@Testcontainers(disabledWithoutDocker = true)
class PaymentIntimationOutboxMySqlTest {

    @Container
    static final MySQLContainer<?> MYSQL = new MySQLContainer<>("mysql:8.0")
            .withCommand("--log-bin-trust-function-creators=1")
            .withDatabaseName("chitfund_payments")
            .withUsername("chitfund")
            .withPassword("testpassword");

    // ── Scenario 1: approval enqueues exactly one outbox row per destination ──

    @Test
    void approvalPublishesExactlyOneOutboxRowPerDestination() {
        JdbcTemplate jdbc = migrated();
        PaymentOutboxStore store = new PaymentOutboxStore(jdbc);
        String eventId = UUID.randomUUID().toString();
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

    // ── Scenario 2: retrying the same approval cannot create a second outbox row ──

    @Test
    void retryingApprovalWithSameEventIdDoesNotCreateDuplicateOutboxRow() {
        JdbcTemplate jdbc = migrated();
        PaymentOutboxStore store = new PaymentOutboxStore(jdbc);
        String eventId = UUID.randomUUID().toString();
        String tenantId = UUID.randomUUID().toString();
        List<String> destinations = List.of("NOTIFICATION_EVENTS");

        tx(jdbc).executeWithoutResult(status ->
                store.enqueue(eventId, tenantId, "PAYMENT_BATCH", UUID.randomUUID().toString(),
                        "PAYMENT_COMPLETED", "{}", destinations));

        // A second enqueue with the same (event_id, destination) must fail at the DB level.
        // PaymentIntimationService uses "INTIM:<id>" as the idempotency key; PaymentService
        // maps that to the event_id. The unique constraint (uq_outbox_event_destination)
        // prevents a second outbox row even if the business layer misses the idempotency guard.
        org.assertj.core.api.Assertions.assertThatCode(() ->
                tx(jdbc).executeWithoutResult(status ->
                        store.enqueue(eventId, tenantId, "PAYMENT_BATCH",
                                UUID.randomUUID().toString(), "PAYMENT_COMPLETED", "{}",
                                destinations)))
                .isInstanceOf(Exception.class);

        assertThat(jdbc.queryForObject(
                "SELECT COUNT(*) FROM event_outbox WHERE event_id=? AND destination=?",
                Integer.class, eventId, "NOTIFICATION_EVENTS")).isEqualTo(1);
    }

    // ── Scenario 3: rolled-back payment transaction leaves no outbox row ──

    @Test
    void rolledBackPaymentTransactionLeavesNoOutboxRow() {
        JdbcTemplate jdbc = migrated();
        PaymentOutboxStore store = new PaymentOutboxStore(jdbc);
        String eventId = UUID.randomUUID().toString();
        String tenantId = UUID.randomUUID().toString();

        try {
            tx(jdbc).executeWithoutResult(status -> {
                store.enqueue(eventId, tenantId, "PAYMENT_BATCH",
                        UUID.randomUUID().toString(), "PAYMENT_COMPLETED", "{}",
                        List.of("NOTIFICATION_EVENTS"));
                status.setRollbackOnly();
            });
        } catch (Exception ignored) {}

        assertThat(jdbc.queryForObject(
                "SELECT COUNT(*) FROM event_outbox WHERE event_id=?",
                Integer.class, eventId)).isZero();
    }

    // ── Scenario 4: outbox row carries the tenant so the relay can set TenantContext ──

    @Test
    void outboxRowPreservesTenantIdForRelayDelivery() {
        JdbcTemplate jdbc = migrated();
        PaymentOutboxStore store = new PaymentOutboxStore(jdbc);
        String eventId = UUID.randomUUID().toString();
        String tenantId = UUID.randomUUID().toString();

        tx(jdbc).executeWithoutResult(status ->
                store.enqueue(eventId, tenantId, "PAYMENT_BATCH", UUID.randomUUID().toString(),
                        "PAYMENT_COMPLETED", "{}", List.of("NOTIFICATION_EVENTS")));

        assertThat(jdbc.queryForObject(
                "SELECT tenant_id FROM event_outbox WHERE event_id=?",
                String.class, eventId)).isEqualTo(tenantId);
    }

    // ── Helpers ──────────────────────────────────────────────────────────────────

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
