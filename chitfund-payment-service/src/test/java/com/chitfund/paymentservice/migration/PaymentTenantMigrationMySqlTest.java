package com.chitfund.paymentservice.migration;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.MySQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.sql.DriverManager;
import java.sql.SQLException;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

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

    @Test
    void auxiliaryFinancialRowsRequireTenantAndCreditIsUniqueWithinTenant() throws Exception {
        Flyway.configure().dataSource(MYSQL.getJdbcUrl(), MYSQL.getUsername(), MYSQL.getPassword())
                .locations("classpath:db/migration").load().migrate();

        try (var connection = DriverManager.getConnection(
                MYSQL.getJdbcUrl(), MYSQL.getUsername(), MYSQL.getPassword())) {
            for (String table : java.util.List.of(
                    "payment_allocations",
                    "member_credit_balance",
                    "member_credit_transactions",
                    "cash_request_audit_logs")) {
                try (var statement = connection.prepareStatement(
                        "SELECT COLUMN_DEFAULT, IS_NULLABLE FROM information_schema.COLUMNS " +
                                "WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME='tenant_id'")) {
                    statement.setString(1, table);
                    try (var result = statement.executeQuery()) {
                        assertThat(result.next()).as(table + " tenant column exists").isTrue();
                        assertThat(result.getString("COLUMN_DEFAULT")).as(table + " has no default tenant").isNull();
                        assertThat(result.getString("IS_NULLABLE")).as(table + " requires tenant").isEqualTo("NO");
                    }
                }
            }

            String memberId = UUID.randomUUID().toString();
            insertCreditBalance(connection, UUID.randomUUID().toString(), "tenant-a", memberId);
            insertCreditBalance(connection, UUID.randomUUID().toString(), "tenant-b", memberId);

            assertThatThrownBy(() -> insertCreditBalance(
                    connection, UUID.randomUUID().toString(), "tenant-a", memberId))
                    .isInstanceOf(SQLException.class);
        }
    }

    @Test
    void notificationStorageCanIsolateTheSameRoleAcrossTenants() throws Exception {
        Flyway.configure().dataSource(MYSQL.getJdbcUrl(), MYSQL.getUsername(), MYSQL.getPassword())
                .locations("classpath:db/migration").load().migrate();

        try (var connection = DriverManager.getConnection(
                MYSQL.getJdbcUrl(), MYSQL.getUsername(), MYSQL.getPassword())) {
            insertNotification(connection, "tenant-a", "ADMIN");
            insertNotification(connection, "tenant-b", "ADMIN");
            try (var statement = connection.prepareStatement(
                    "SELECT COUNT(*) FROM notifications WHERE tenant_id=? AND recipient_role='ADMIN'")) {
                statement.setString(1, "tenant-a");
                try (var result = statement.executeQuery()) {
                    assertThat(result.next()).isTrue();
                    assertThat(result.getInt(1)).isEqualTo(1);
                }
            }
        }
    }

    @Test
    void payoutCommandReceiptAllowsOnlyOneConcurrentWinnerOnRealMySql() throws Exception {
        Flyway.configure().dataSource(MYSQL.getJdbcUrl(), MYSQL.getUsername(), MYSQL.getPassword())
                .locations("classpath:db/migration").load().migrate();
        String commandId = UUID.randomUUID().toString();
        CountDownLatch ready = new CountDownLatch(2);
        CountDownLatch start = new CountDownLatch(1);
        AtomicInteger successes = new AtomicInteger();
        var executor = Executors.newFixedThreadPool(2);
        try {
            var tasks = java.util.stream.IntStream.range(0, 2).mapToObj(index ->
                    executor.submit(() -> {
                        ready.countDown();
                        start.await(10, TimeUnit.SECONDS);
                        try (var connection = DriverManager.getConnection(
                                MYSQL.getJdbcUrl(), MYSQL.getUsername(), MYSQL.getPassword());
                             var statement = connection.prepareStatement("""
                                INSERT INTO internal_financial_operations
                                    (id, tenant_id, operation_type, request_hash, completed_at)
                                VALUES (?, 'tenant-a', 'RECORD_TREASURY_DEBIT', ?, NOW(6))
                                """)) {
                            statement.setString(1, commandId);
                            statement.setString(2, "a".repeat(64));
                            statement.executeUpdate();
                            successes.incrementAndGet();
                        } catch (SQLException duplicate) {
                            // Exactly one contender must lose on the primary key.
                        }
                        return null;
                    })).toList();
            assertThat(ready.await(10, TimeUnit.SECONDS)).isTrue();
            start.countDown();
            for (var task : tasks) task.get(20, TimeUnit.SECONDS);
        } finally {
            executor.shutdownNow();
        }
        assertThat(successes.get()).isEqualTo(1);

        try (var connection = DriverManager.getConnection(
                MYSQL.getJdbcUrl(), MYSQL.getUsername(), MYSQL.getPassword());
             var statement = connection.prepareStatement(
                     "SELECT COUNT(*) FROM internal_financial_operations WHERE id=?")) {
            statement.setString(1, commandId);
            try (var result = statement.executeQuery()) {
                assertThat(result.next()).isTrue();
                assertThat(result.getInt(1)).isEqualTo(1);
            }
        }
    }

    @Test
    void receiptAndWalletEffectRollbackTogetherOnRealMySql() throws Exception {
        Flyway.configure().dataSource(MYSQL.getJdbcUrl(), MYSQL.getUsername(), MYSQL.getPassword())
                .locations("classpath:db/migration").load().migrate();
        String commandId = UUID.randomUUID().toString();
        try (var connection = DriverManager.getConnection(
                MYSQL.getJdbcUrl(), MYSQL.getUsername(), MYSQL.getPassword())) {
            connection.setAutoCommit(false);
            insertReceiptAndWallet(connection, commandId);
            connection.rollback();
            assertThat(count(connection, "internal_financial_operations", commandId)).isZero();
            assertThat(count(connection, "admin_wallet", commandId)).isZero();

            insertReceiptAndWallet(connection, commandId);
            connection.commit();
            assertThat(count(connection, "internal_financial_operations", commandId)).isEqualTo(1);
            assertThat(count(connection, "admin_wallet", commandId)).isEqualTo(1);
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
                        "payment_reference, recorded_at, synced_at, created_at, updated_at) " +
                        "VALUES (?, ?, ?, ?, 100.00, ?, 'COMPLETED', ?, NOW(6), NOW(6), NOW(6), NOW(6))")) {
            statement.setString(1, id);
            statement.setString(2, tenantId);
            statement.setString(3, UUID.randomUUID().toString());
            statement.setString(4, UUID.randomUUID().toString());
            statement.setString(5, mode);
            statement.setString(6, reference);
            statement.executeUpdate();
        }
    }

    private static void insertNotification(
            java.sql.Connection connection, String tenantId, String role) throws SQLException {
        try (var statement = connection.prepareStatement(
                "INSERT INTO notifications " +
                        "(id, tenant_id, recipient_role, type, title, message, created_at) " +
                        "VALUES (?, ?, ?, 'GENERAL', 'Title', 'Message', NOW(6))")) {
            statement.setString(1, UUID.randomUUID().toString());
            statement.setString(2, tenantId);
            statement.setString(3, role);
            statement.executeUpdate();
        }
    }

    private static void insertCreditBalance(
            java.sql.Connection connection,
            String id,
            String tenantId,
            String memberId) throws SQLException {
        try (var statement = connection.prepareStatement(
                "INSERT INTO member_credit_balance " +
                        "(id, tenant_id, member_id, balance, created_at, updated_at) " +
                        "VALUES (?, ?, ?, 0.00, NOW(6), NOW(6))")) {
            statement.setString(1, id);
            statement.setString(2, tenantId);
            statement.setString(3, memberId);
            statement.executeUpdate();
        }
    }

    private static void insertReceiptAndWallet(java.sql.Connection connection, String commandId)
            throws SQLException {
        try (var receipt = connection.prepareStatement("""
                INSERT INTO internal_financial_operations
                    (id, tenant_id, operation_type, request_hash, completed_at)
                VALUES (?, 'tenant-a', 'RECORD_TREASURY_DEBIT', ?, NOW(6))
                """)) {
            receipt.setString(1, commandId);
            receipt.setString(2, "b".repeat(64));
            receipt.executeUpdate();
        }
        try (var wallet = connection.prepareStatement("""
                INSERT INTO admin_wallet
                    (id, tenant_id, account_type, entry_type, amount, amount_paise,
                     category, description, created_at, created_by)
                VALUES (?, 'tenant-a', 'BANK', 'OUT', 100.00, 10000,
                        'PAYOUT_DISBURSEMENT', 'test', NOW(6), ?)
                """)) {
            wallet.setString(1, commandId);
            wallet.setString(2, UUID.randomUUID().toString());
            wallet.executeUpdate();
        }
    }

    private static int count(java.sql.Connection connection, String table, String id)
            throws SQLException {
        String allowedTable = switch (table) {
            case "internal_financial_operations" -> "internal_financial_operations";
            case "admin_wallet" -> "admin_wallet";
            default -> throw new IllegalArgumentException("Unexpected table");
        };
        try (var statement = connection.prepareStatement(
                "SELECT COUNT(*) FROM " + allowedTable + " WHERE id=?")) {
            statement.setString(1, id);
            try (var result = statement.executeQuery()) {
                result.next();
                return result.getInt(1);
            }
        }
    }
}
