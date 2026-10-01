package com.chitfund.notificationservice.migration;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.MySQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.sql.DriverManager;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

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
        }
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
}
