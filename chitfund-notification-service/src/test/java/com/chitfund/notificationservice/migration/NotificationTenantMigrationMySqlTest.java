package com.chitfund.notificationservice.migration;

import com.chitfund.notificationservice.outbox.NotificationDeliveryOutbox;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.testcontainers.containers.MySQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.sql.DriverManager;
import java.sql.SQLException;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@Testcontainers(disabledWithoutDocker = true)
class NotificationTenantMigrationMySqlTest {

    @Container
    static final MySQLContainer<?> MYSQL = new MySQLContainer<>("mysql:8.0")
            .withDatabaseName("chitfund_notifications")
            .withUsername("chitfund")
            .withPassword("testpassword");

    @Test
    void migrationsRemoveTheDefaultTenantAndSupportTenantIsolation() throws Exception {
        Flyway.configure().dataSource(MYSQL.getJdbcUrl(), MYSQL.getUsername(), MYSQL.getPassword())
                .locations("classpath:db/migration").load().migrate();

        try (var connection = DriverManager.getConnection(
                MYSQL.getJdbcUrl(), MYSQL.getUsername(), MYSQL.getPassword())) {
            String recipient = UUID.randomUUID().toString();
            insertInApp(connection, "tenant-a", recipient);
            insertInApp(connection, "tenant-b", recipient);

            try (var statement = connection.prepareStatement(
                    "SELECT COUNT(*) FROM in_app_notifications WHERE tenant_id=? AND recipient_id=?")) {
                statement.setString(1, "tenant-a");
                statement.setString(2, recipient);
                try (var rows = statement.executeQuery()) {
                    assertThat(rows.next()).isTrue();
                    assertThat(rows.getInt(1)).isEqualTo(1);
                }
            }

            try (var columns = connection.createStatement().executeQuery(
                    "SELECT column_default, is_nullable FROM information_schema.columns " +
                            "WHERE table_schema=DATABASE() AND table_name='in_app_notifications' " +
                            "AND column_name='tenant_id'")) {
                assertThat(columns.next()).isTrue();
                assertThat(columns.getString("column_default")).isNull();
                assertThat(columns.getString("is_nullable")).isEqualTo("YES");
            }

            String eventId = UUID.randomUUID().toString();
            insertDelivery(connection, eventId, "event:push:device-a");
            assertThatThrownBy(() -> insertDelivery(
                    connection, eventId, "event:push:device-a"))
                    .isInstanceOf(SQLException.class);
        }
    }

    @Test
    void notificationDeliveryInsertRollsBackWithItsConsumerTransaction() throws Exception {
        Flyway.configure().dataSource(MYSQL.getJdbcUrl(), MYSQL.getUsername(), MYSQL.getPassword())
                .locations("classpath:db/migration").load().migrate();
        String dedupeKey = "rollback:" + UUID.randomUUID();
        try (var connection = DriverManager.getConnection(
                MYSQL.getJdbcUrl(), MYSQL.getUsername(), MYSQL.getPassword())) {
            connection.setAutoCommit(false);
            insertDelivery(connection, UUID.randomUUID().toString(), dedupeKey);
            connection.rollback();
            connection.setAutoCommit(true);

            try (var statement = connection.prepareStatement(
                    "SELECT COUNT(*) FROM notification_delivery_outbox WHERE dedupe_key=?")) {
                statement.setString(1, dedupeKey);
                try (var rows = statement.executeQuery()) {
                    assertThat(rows.next()).isTrue();
                    assertThat(rows.getInt(1)).isZero();
                }
            }
        }
    }

    @Test
    void failedNotificationDeliveryCanBeReplayedOnceWithAuditEvidence() throws Exception {
        Flyway.configure().dataSource(MYSQL.getJdbcUrl(), MYSQL.getUsername(), MYSQL.getPassword())
                .locations("classpath:db/migration").load().migrate();
        var dataSource = new DriverManagerDataSource(
                MYSQL.getJdbcUrl(), MYSQL.getUsername(), MYSQL.getPassword());
        var jdbc = new JdbcTemplate(dataSource);
        var outbox = new NotificationDeliveryOutbox(jdbc);
        String deliveryId = UUID.randomUUID().toString();
        String eventId = UUID.randomUUID().toString();
        String notificationId = UUID.randomUUID().toString();

        jdbc.update("""
                INSERT INTO notifications (
                    id, recipient_id, channel, event_type, message, status, created_at)
                VALUES (?, ?, 'SMS', 'PAYMENT_REMINDER', 'test', 'FAILED', NOW(6))
                """, notificationId, UUID.randomUUID().toString());
        jdbc.update("""
                INSERT INTO notification_delivery_outbox (
                    delivery_id, event_id, dedupe_key, tenant_id, notification_id,
                    delivery_type, payload, status, attempts, available_at, created_at)
                VALUES (?, ?, ?, 'tenant-a', ?, 'CHANNEL', JSON_OBJECT(), 'FAILED', 10, NOW(6), NOW(6))
                """, deliveryId, eventId, "replay:" + deliveryId, notificationId);

        assertThat(outbox.replayFailed(deliveryId, "operator-1", "INC-123 recovered"))
                .isTrue();
        assertThat(outbox.replayFailed(deliveryId, "operator-1", "duplicate"))
                .isFalse();
        assertThat(jdbc.queryForObject(
                "SELECT status FROM notification_delivery_outbox WHERE delivery_id=?",
                String.class, deliveryId)).isEqualTo("PENDING");
        assertThat(jdbc.queryForObject(
                "SELECT status FROM notifications WHERE id=?", String.class, notificationId))
                .isEqualTo("PENDING");
        assertThat(jdbc.queryForObject(
                "SELECT COUNT(*) FROM notification_delivery_replay_audit " +
                        "WHERE delivery_id=? AND event_id=? AND replayed_by='operator-1' " +
                        "AND reason='INC-123 recovered'",
                Integer.class, deliveryId, eventId)).isEqualTo(1);
    }

    private void insertInApp(java.sql.Connection connection, String tenantId, String recipientId)
            throws Exception {
        try (var statement = connection.prepareStatement(
                "INSERT INTO in_app_notifications " +
                        "(id,tenant_id,recipient_id,title,message,type,is_read,created_at) " +
                        "VALUES (?,?,?,?,?,'GENERAL',FALSE,NOW(6))")) {
            statement.setString(1, UUID.randomUUID().toString());
            statement.setString(2, tenantId);
            statement.setString(3, recipientId);
            statement.setString(4, "Title");
            statement.setString(5, "Message");
            statement.executeUpdate();
        }
    }

    private void insertDelivery(java.sql.Connection connection, String eventId, String dedupeKey)
            throws Exception {
        try (var statement = connection.prepareStatement(
                "INSERT INTO notification_delivery_outbox " +
                        "(delivery_id,event_id,dedupe_key,delivery_type,payload,status,attempts," +
                        "available_at,created_at) VALUES (?,?,?,'PUSH',JSON_OBJECT(),'PENDING',0,NOW(6),NOW(6))")) {
            statement.setString(1, UUID.randomUUID().toString());
            statement.setString(2, eventId);
            statement.setString(3, dedupeKey);
            statement.executeUpdate();
        }
    }
}
