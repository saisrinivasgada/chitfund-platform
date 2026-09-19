package com.chitfund.paymentservice.migration;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.MySQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.sql.DriverManager;
import java.sql.SQLException;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

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

    @Test
    void paymentReferenceIsUniquePerTenantAndModeOnRealMySql() throws Exception {
        Flyway.configure().dataSource(MYSQL.getJdbcUrl(), MYSQL.getUsername(), MYSQL.getPassword())
                .locations("classpath:db/migration").load().migrate();

        String reference = "UTR-" + UUID.randomUUID();
        try (var connection = DriverManager.getConnection(MYSQL.getJdbcUrl(), MYSQL.getUsername(), MYSQL.getPassword())) {
            insertBatch(connection, UUID.randomUUID().toString(), "tenant-a", "UPI", reference);

            assertThatThrownBy(() -> insertBatch(
                    connection, UUID.randomUUID().toString(), "tenant-a", "UPI", reference))
                    .isInstanceOf(SQLException.class);

            // The same provider reference in another tenant or another payment
            // rail is independent; nullable references remain valid for legacy
            // and cash rows.
            insertBatch(connection, UUID.randomUUID().toString(), "tenant-b", "UPI", reference);
            insertBatch(connection, UUID.randomUUID().toString(), "tenant-a", "BANK_TRANSFER", reference);
            insertBatch(connection, UUID.randomUUID().toString(), "tenant-a", "CASH", null);
            insertBatch(connection, UUID.randomUUID().toString(), "tenant-a", "CASH", null);
        }
    }

    private static void insertBatch(
            java.sql.Connection connection,
            String id,
            String tenantId,
            String mode,
            String reference) throws SQLException {
        try (var statement = connection.prepareStatement(
                "INSERT INTO payment_batches " +
                        "(id, tenant_id, chit_id, member_id, total_amount, payment_mode, status, " +
                        "payment_reference, created_at, updated_at) " +
                        "VALUES (?, ?, ?, ?, 100.00, ?, 'COMPLETED', ?, NOW(6), NOW(6))")) {
            statement.setString(1, id);
            statement.setString(2, tenantId);
            statement.setString(3, UUID.randomUUID().toString());
            statement.setString(4, UUID.randomUUID().toString());
            statement.setString(5, mode);
            statement.setString(6, reference);
            statement.executeUpdate();
        }
    }
}
