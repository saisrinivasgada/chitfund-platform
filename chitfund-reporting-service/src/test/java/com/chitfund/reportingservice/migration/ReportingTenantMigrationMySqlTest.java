package com.chitfund.reportingservice.migration;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.MySQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.sql.DriverManager;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

@Testcontainers
class ReportingTenantMigrationMySqlTest {

    @Container
    static final MySQLContainer<?> MYSQL = new MySQLContainer<>("mysql:8.0")
            .withDatabaseName("chitfund_reporting").withUsername("chitfund").withPassword("testpassword");

    @Test
    void projectionTenantsHaveNoDatabaseDefaults() throws Exception {
        Flyway.configure().dataSource(MYSQL.getJdbcUrl(), MYSQL.getUsername(), MYSQL.getPassword())
                .locations("classpath:db/migration").load().migrate();

        try (var connection = DriverManager.getConnection(MYSQL.getJdbcUrl(), MYSQL.getUsername(), MYSQL.getPassword())) {
            for (String table : List.of("monthly_collection_snapshots", "member_payment_summaries", "payout_summaries")) {
                try (var statement = connection.prepareStatement(
                        "SELECT COLUMN_DEFAULT, IS_NULLABLE FROM information_schema.COLUMNS " +
                                "WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME='tenant_id'")) {
                    statement.setString(1, table);
                    try (var result = statement.executeQuery()) {
                        assertThat(result.next()).isTrue();
                        assertThat(result.getString("COLUMN_DEFAULT")).as(table).isNull();
                        assertThat(result.getString("IS_NULLABLE")).as(table).isEqualTo("NO");
                    }
                }
            }
        }
    }
}
