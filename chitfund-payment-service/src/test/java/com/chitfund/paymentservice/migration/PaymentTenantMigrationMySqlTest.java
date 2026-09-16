package com.chitfund.paymentservice.migration;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.MySQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.sql.DriverManager;

import static org.assertj.core.api.Assertions.assertThat;

@Testcontainers
class PaymentTenantMigrationMySqlTest {

    @Container
    static final MySQLContainer<?> MYSQL = new MySQLContainer<>("mysql:8.0")
            .withDatabaseName("chitfund_payments").withUsername("chitfund").withPassword("testpassword");

    @Test
    void walletTenantHasNoDatabaseDefault() throws Exception {
        Flyway.configure().dataSource(MYSQL.getJdbcUrl(), MYSQL.getUsername(), MYSQL.getPassword())
                .locations("classpath:db/migration").load().migrate();

        try (var connection = DriverManager.getConnection(MYSQL.getJdbcUrl(), MYSQL.getUsername(), MYSQL.getPassword());
             var statement = connection.prepareStatement(
                     "SELECT COLUMN_DEFAULT, IS_NULLABLE FROM information_schema.COLUMNS " +
                             "WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='admin_wallet' AND COLUMN_NAME='tenant_id'")) {
            try (var result = statement.executeQuery()) {
                assertThat(result.next()).isTrue();
                assertThat(result.getString("COLUMN_DEFAULT")).isNull();
                assertThat(result.getString("IS_NULLABLE")).isEqualTo("NO");
            }
        }
    }
}
