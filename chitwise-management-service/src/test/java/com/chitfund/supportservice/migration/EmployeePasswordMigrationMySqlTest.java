package com.chitfund.supportservice.migration;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.MySQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.sql.DriverManager;

import static org.assertj.core.api.Assertions.assertThat;

@Testcontainers(disabledWithoutDocker = true)
class EmployeePasswordMigrationMySqlTest {

    @Container
    static final MySQLContainer<?> MYSQL = new MySQLContainer<>("mysql:8.0")
            .withDatabaseName("chitwise_management")
            .withUsername("chitfund")
            .withPassword("testpassword");

    @Test
    void freshMySqlAppliesCurrentMigrationsAndKeepsV9Retired() throws Exception {
        Flyway flyway = Flyway.configure()
                .dataSource(MYSQL.getJdbcUrl(), MYSQL.getUsername(), MYSQL.getPassword())
                .locations("classpath:db/migration")
                .load();

        flyway.migrate();

        try (var connection = DriverManager.getConnection(
                MYSQL.getJdbcUrl(), MYSQL.getUsername(), MYSQL.getPassword())) {
            try (var statement = connection.prepareStatement(
                    "SELECT version, success FROM flyway_schema_history WHERE version IN ('9', '10', '11', '12') ORDER BY version");
                 var rows = statement.executeQuery()) {
                assertThat(rows.next()).isTrue();
                assertThat(rows.getString("version")).isEqualTo("10");
                assertThat(rows.getBoolean("success")).isTrue();
                assertThat(rows.next()).isTrue();
                assertThat(rows.getString("version")).isEqualTo("11");
                assertThat(rows.getBoolean("success")).isTrue();
                assertThat(rows.next()).isTrue();
                assertThat(rows.getString("version")).isEqualTo("12");
                assertThat(rows.getBoolean("success")).isTrue();
                assertThat(rows.next()).isFalse();
            }

            try (var statement = connection.prepareStatement(
                    "SELECT IS_NULLABLE FROM information_schema.columns " +
                            "WHERE table_schema = DATABASE() AND table_name = 'support_tickets' AND column_name = 'tenant_id'");
                 var row = statement.executeQuery()) {
                assertThat(row.next()).isTrue();
                assertThat(row.getString("IS_NULLABLE")).isEqualTo("YES");
            }

            try (var statement = connection.prepareStatement(
                    "SELECT must_change_password, auth_version FROM employees WHERE id = 'EMP-001'");
                 var row = statement.executeQuery()) {
                assertThat(row.next()).isTrue();
                assertThat(row.getBoolean("must_change_password")).isFalse();
                assertThat(row.getLong("auth_version")).isZero();
            }

            try (var statement = connection.prepareStatement(
                    "SELECT CHARACTER_MAXIMUM_LENGTH FROM information_schema.columns " +
                            "WHERE table_schema = DATABASE() AND table_name = 'hub_refresh_sessions' " +
                            "AND column_name = 'employee_id'");
                 var row = statement.executeQuery()) {
                assertThat(row.next()).isTrue();
                assertThat(row.getLong("CHARACTER_MAXIMUM_LENGTH")).isEqualTo(36);
            }
        }
    }
}
