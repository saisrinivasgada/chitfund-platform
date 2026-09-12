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
    void freshMySqlAppliesV10AndKeepsV9Retired() throws Exception {
        Flyway flyway = Flyway.configure()
                .dataSource(MYSQL.getJdbcUrl(), MYSQL.getUsername(), MYSQL.getPassword())
                .locations("classpath:db/migration")
                .load();

        flyway.migrate();

        try (var connection = DriverManager.getConnection(
                MYSQL.getJdbcUrl(), MYSQL.getUsername(), MYSQL.getPassword())) {
            try (var statement = connection.prepareStatement(
                    "SELECT version, success FROM flyway_schema_history WHERE version IN ('9', '10') ORDER BY version");
                 var rows = statement.executeQuery()) {
                assertThat(rows.next()).isTrue();
                assertThat(rows.getString("version")).isEqualTo("10");
                assertThat(rows.getBoolean("success")).isTrue();
                assertThat(rows.next()).isFalse();
            }

            try (var statement = connection.prepareStatement(
                    "SELECT must_change_password, auth_version FROM employees WHERE id = 'EMP-001'");
                 var row = statement.executeQuery()) {
                assertThat(row.next()).isTrue();
                assertThat(row.getBoolean("must_change_password")).isFalse();
                assertThat(row.getLong("auth_version")).isZero();
            }
        }
    }
}
