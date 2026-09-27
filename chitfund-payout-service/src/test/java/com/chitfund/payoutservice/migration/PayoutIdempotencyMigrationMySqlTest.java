package com.chitfund.payoutservice.migration;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.MySQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@Testcontainers
class PayoutIdempotencyMigrationMySqlTest {

    @Container
    static final MySQLContainer<?> MYSQL = new MySQLContainer<>("mysql:8.0")
            .withDatabaseName("chitfund_payouts")
            .withUsername("chitfund")
            .withPassword("testpassword");

    @Test
    void disbursementIdempotencyIsEnforcedByRealMySql() throws Exception {
        Flyway.configure()
                .dataSource(MYSQL.getJdbcUrl(), MYSQL.getUsername(), MYSQL.getPassword())
                .locations("classpath:db/migration")
                .load()
                .migrate();

        try (Connection connection = DriverManager.getConnection(
                MYSQL.getJdbcUrl(), MYSQL.getUsername(), MYSQL.getPassword())) {
            String payoutA = UUID.randomUUID().toString();
            String payoutB = UUID.randomUUID().toString();
            String key = UUID.randomUUID().toString();
            insertPayout(connection, payoutA, 1);
            insertPayout(connection, payoutB, 2);

            insertDisbursement(connection, payoutA, key);
            assertThatThrownBy(() -> insertDisbursement(connection, payoutA, key))
                    .isInstanceOf(SQLException.class);

            // Keys are scoped to one payout, and legacy rows without a key can
            // coexist because MySQL permits multiple NULL values in a unique key.
            insertDisbursement(connection, payoutB, key);
            insertDisbursement(connection, payoutA, null);
            insertDisbursement(connection, payoutA, null);

            try (var statement = connection.prepareStatement(
                    "SELECT COUNT(*) FROM payout_disbursements WHERE payout_id=?")) {
                statement.setString(1, payoutA);
                try (var result = statement.executeQuery()) {
                    assertThat(result.next()).isTrue();
                    assertThat(result.getInt(1)).isEqualTo(3);
                }
            }
        }
    }

    private static void insertPayout(Connection connection, String payoutId, int month)
            throws SQLException {
        try (var statement = connection.prepareStatement("""
                INSERT INTO payouts (
                    id, tenant_id, chit_id, member_id, month_number,
                    winning_amount, discount_amount, net_payout_amount,
                    status, created_by, created_at, updated_at)
                VALUES (?, 'tenant-test', ?, ?, ?, 1000.00, 100.00, 900.00,
                        'PENDING', ?, NOW(6), NOW(6))
                """)) {
            statement.setString(1, payoutId);
            statement.setString(2, UUID.randomUUID().toString());
            statement.setString(3, UUID.randomUUID().toString());
            statement.setInt(4, month);
            statement.setString(5, UUID.randomUUID().toString());
            statement.executeUpdate();
        }
    }

    private static void insertDisbursement(Connection connection, String payoutId, String key)
            throws SQLException {
        try (var statement = connection.prepareStatement("""
                INSERT INTO payout_disbursements (
                    id, payout_id, amount, mode, disbursed_by, disbursed_at,
                    idempotency_key, idempotency_request_hash)
                VALUES (?, ?, 100.00, 'CASH', ?, NOW(6), ?, ?)
                """)) {
            statement.setString(1, UUID.randomUUID().toString());
            statement.setString(2, payoutId);
            statement.setString(3, UUID.randomUUID().toString());
            statement.setString(4, key);
            statement.setString(5, key == null ? null : "a".repeat(64));
            statement.executeUpdate();
        }
    }
}
