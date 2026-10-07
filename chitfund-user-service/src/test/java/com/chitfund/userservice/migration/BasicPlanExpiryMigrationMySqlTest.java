package com.chitfund.userservice.migration;

import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.MigrationVersion;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.MySQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.sql.DriverManager;
import java.time.LocalDateTime;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@Testcontainers(disabledWithoutDocker = true)
class BasicPlanExpiryMigrationMySqlTest {

    @Container
    static final MySQLContainer<?> MYSQL = new MySQLContainer<>("mysql:8.0")
            .withDatabaseName("chitfund_users").withUsername("chitfund").withPassword("testpassword");

    @Test
    void freeBasicBackfillRemovesOnlyBasicExpiriesOnUpgrade() throws Exception {
        Flyway.configure().dataSource(MYSQL.getJdbcUrl(), MYSQL.getUsername(), MYSQL.getPassword())
                .locations("classpath:db/migration")
                .target(MigrationVersion.fromVersion("173"))
                .load().migrate();

        String basicId = UUID.randomUUID().toString();
        String paidId = UUID.randomUUID().toString();
        LocalDateTime oldExpiry = LocalDateTime.of(2026, 10, 8, 12, 0);
        try (var connection = DriverManager.getConnection(
                MYSQL.getJdbcUrl(), MYSQL.getUsername(), MYSQL.getPassword())) {
            insertTenant(connection, basicId, "BASIC", oldExpiry);
            insertTenant(connection, paidId, "GROWTH", oldExpiry);
        }

        Flyway.configure().dataSource(MYSQL.getJdbcUrl(), MYSQL.getUsername(), MYSQL.getPassword())
                .locations("classpath:db/migration").load().migrate();

        try (var connection = DriverManager.getConnection(
                MYSQL.getJdbcUrl(), MYSQL.getUsername(), MYSQL.getPassword());
             var statement = connection.prepareStatement(
                     "SELECT id, plan_expires_at FROM tenants WHERE id IN (?, ?) ORDER BY id")) {
            statement.setString(1, basicId);
            statement.setString(2, paidId);
            try (var result = statement.executeQuery()) {
                java.util.Map<String, LocalDateTime> expiries = new java.util.HashMap<>();
                while (result.next()) {
                    expiries.put(result.getString("id"), result.getTimestamp("plan_expires_at").toLocalDateTime());
                }
                assertThat(expiries.get(basicId)).isEqualTo(
                        LocalDateTime.of(9999, 12, 31, 23, 59, 59));
                assertThat(expiries.get(paidId)).isEqualTo(oldExpiry);
            }
        }
    }

    private static void insertTenant(java.sql.Connection connection, String id,
                                     String plan, LocalDateTime expiry) throws Exception {
        try (var statement = connection.prepareStatement("""
                INSERT INTO tenants
                    (id, name, slug, status, plan, plan_expires_at, created_at, updated_at)
                VALUES (?, 'Migration Test', ?, 'ACTIVE', ?, ?, NOW(6), NOW(6))
                """)) {
            statement.setString(1, id);
            statement.setString(2, "migration-" + id.substring(0, 8));
            statement.setString(3, plan);
            statement.setTimestamp(4, java.sql.Timestamp.valueOf(expiry));
            statement.executeUpdate();
        }
    }
}
