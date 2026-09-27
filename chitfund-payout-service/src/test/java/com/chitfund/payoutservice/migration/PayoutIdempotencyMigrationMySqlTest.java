package com.chitfund.payoutservice.migration;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.MySQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.List;
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

    @Test
    void financialCommandsAreUniqueAndExecuteInPayoutOrderOnRealMySql() throws Exception {
        Flyway.configure()
                .dataSource(MYSQL.getJdbcUrl(), MYSQL.getUsername(), MYSQL.getPassword())
                .locations("classpath:db/migration").load().migrate();

        try (Connection connection = DriverManager.getConnection(
                MYSQL.getJdbcUrl(), MYSQL.getUsername(), MYSQL.getPassword())) {
            String payout = UUID.randomUUID().toString();
            insertPayout(connection, payout, 9);
            String firstId = UUID.randomUUID().toString();
            String secondId = UUID.randomUUID().toString();
            insertCommand(connection, firstId, payout, 1, payout + ":one");
            insertCommand(connection, secondId, payout, 2, payout + ":two");

            assertThat(readyCommands(connection)).containsExactly(firstId);
            try (var statement = connection.prepareStatement(
                    "UPDATE payout_financial_commands SET status='COMPLETED' WHERE id=?")) {
                statement.setString(1, firstId);
                statement.executeUpdate();
            }
            assertThat(readyCommands(connection)).containsExactly(secondId);

            assertThatThrownBy(() -> insertCommand(
                    connection, UUID.randomUUID().toString(), payout, 3, payout + ":two"))
                    .isInstanceOf(SQLException.class);
            assertThatThrownBy(() -> insertCommand(
                    connection, UUID.randomUUID().toString(), payout, 2, payout + ":three"))
                    .isInstanceOf(SQLException.class);
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

    private static void insertCommand(Connection connection, String id, String payoutId,
                                      long sequence, String dedupeKey) throws SQLException {
        try (var statement = connection.prepareStatement("""
                INSERT INTO payout_financial_commands (
                    id, tenant_id, actor_id, payout_id, sequence_no, dedupe_key, command_type,
                    status, attempts, available_at, created_at)
                VALUES (?, 'tenant-test', ?, ?, ?, ?, 'REVERT_DEDUCTIONS',
                        'PENDING', 0, NOW(6), NOW(6))
                """)) {
            statement.setString(1, id);
            statement.setString(2, UUID.randomUUID().toString());
            statement.setString(3, payoutId);
            statement.setLong(4, sequence);
            statement.setString(5, dedupeKey);
            statement.executeUpdate();
        }
    }

    private static List<String> readyCommands(Connection connection) throws SQLException {
        List<String> ids = new ArrayList<>();
        try (var statement = connection.prepareStatement("""
                SELECT c.id FROM payout_financial_commands c
                WHERE c.status IN ('PENDING','RETRY') AND c.available_at <= NOW(6)
                  AND NOT EXISTS (
                    SELECT 1 FROM payout_financial_commands older
                    WHERE older.payout_id=c.payout_id
                      AND older.sequence_no < c.sequence_no
                      AND older.status <> 'COMPLETED')
                ORDER BY c.created_at, c.id
                """)) {
            try (var result = statement.executeQuery()) {
                while (result.next()) ids.add(result.getString(1));
            }
        }
        return ids;
    }
}
