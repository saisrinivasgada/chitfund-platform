package com.chitfund.chitservice.migration;

import com.chitfund.common.outbox.DurableEventOutbox;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.containers.MySQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.sql.DriverManager;
import java.sql.SQLException;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@Testcontainers(disabledWithoutDocker = true)
class AuditOutboxMigrationMySqlTest {

    @Container
    static final MySQLContainer<?> MYSQL = new MySQLContainer<>("mysql:8.0")
            .withDatabaseName("chitfund_chits")
            .withUsername("chitfund")
            .withPassword("testpassword");

    @Test
    void migrationsCreateJsonOutboxAndEnforceOneDeliveryPerEventDestination() throws Exception {
        Flyway.configure().dataSource(MYSQL.getJdbcUrl(), MYSQL.getUsername(), MYSQL.getPassword())
                .locations("classpath:db/migration").load().migrate();

        try (var connection = DriverManager.getConnection(
                MYSQL.getJdbcUrl(), MYSQL.getUsername(), MYSQL.getPassword())) {
            String sql = "INSERT INTO audit_event_outbox " +
                    "(delivery_id,event_id,tenant_id,entity_type,entity_id,destination,payload," +
                    "status,attempts,available_at,created_at) " +
                    "VALUES(?,?,?,?,?,?,CAST(? AS JSON),'PENDING',0,NOW(6),NOW(6))";
            insert(connection, sql, "10000000-0000-0000-0000-000000000001");
            assertThatThrownBy(() -> insert(
                    connection, sql, "10000000-0000-0000-0000-000000000002"))
                    .isInstanceOf(SQLException.class);

            try (var rows = connection.createStatement().executeQuery(
                    "SELECT JSON_UNQUOTE(JSON_EXTRACT(payload, '$.action')) " +
                            "FROM audit_event_outbox")) {
                assertThat(rows.next()).isTrue();
                assertThat(rows.getString(1)).isEqualTo("CHIT_CREATED");
            }
        }
    }

    @Test
    void lifecycleCommandIsDeduplicatedWithinTenantOnRealMySql() throws Exception {
        Flyway.configure().dataSource(MYSQL.getJdbcUrl(), MYSQL.getUsername(), MYSQL.getPassword())
                .locations("classpath:db/migration").load().migrate();

        try (var connection = DriverManager.getConnection(
                MYSQL.getJdbcUrl(), MYSQL.getUsername(), MYSQL.getPassword())) {
            String chitId = "50000000-0000-0000-0000-000000000001";
            insertLifecycleCommand(connection, "tenant-a", chitId);
            assertThatThrownBy(() -> insertLifecycleCommand(
                    connection, "tenant-a", chitId))
                    .isInstanceOf(SQLException.class);
            insertLifecycleCommand(connection, "tenant-b", chitId);
        }
    }

    @Test
    void notificationOutboxCommitsAndRollsBackWithChitTransaction() {
        Flyway.configure().dataSource(MYSQL.getJdbcUrl(), MYSQL.getUsername(), MYSQL.getPassword())
                .locations("classpath:db/migration").load().migrate();
        var dataSource = new DriverManagerDataSource(
                MYSQL.getJdbcUrl(), MYSQL.getUsername(), MYSQL.getPassword());
        var jdbc = new JdbcTemplate(dataSource);
        var transactions = new TransactionTemplate(new DataSourceTransactionManager(dataSource));
        var outbox = new DurableEventOutbox(jdbc);
        jdbc.update("DELETE FROM domain_event_outbox");

        transactions.executeWithoutResult(status -> {
            outbox.enqueue("rolled-back", "BULK_IN_APP_BY_MEMBER_IDS",
                    "{\"tenantId\":\"tenant-a\",\"memberIds\":[]}", "notification-events");
            status.setRollbackOnly();
        });
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM domain_event_outbox", Long.class))
                .isZero();

        transactions.executeWithoutResult(status -> outbox.enqueue(
                "committed", "BULK_IN_APP_BY_MEMBER_IDS",
                "{\"tenantId\":\"tenant-a\",\"memberIds\":[]}", "notification-events"));
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM domain_event_outbox", Long.class))
                .isEqualTo(1L);
    }

    private static void insert(java.sql.Connection connection, String sql,
                               String deliveryId) throws SQLException {
        try (var ps = connection.prepareStatement(sql)) {
            ps.setString(1, deliveryId);
            ps.setString(2, "20000000-0000-0000-0000-000000000001");
            ps.setString(3, "30000000-0000-0000-0000-000000000001");
            ps.setString(4, "CHIT");
            ps.setString(5, "40000000-0000-0000-0000-000000000001");
            ps.setString(6, "audit-events");
            ps.setString(7, "{\"action\":\"CHIT_CREATED\"}");
            ps.executeUpdate();
        }
    }

    private static void insertLifecycleCommand(java.sql.Connection connection,
                                               String tenantId, String chitId) throws SQLException {
        try (var ps = connection.prepareStatement("""
                INSERT INTO chit_lifecycle_commands (
                    id,tenant_id,chit_id,command_type,dedupe_key,status,attempts,
                    available_at,created_at)
                VALUES(?,?,?,?,?,'PENDING',0,NOW(6),NOW(6))
                """)) {
            ps.setString(1, UUID.randomUUID().toString());
            ps.setString(2, tenantId);
            ps.setString(3, chitId);
            ps.setString(4, "CLOSE_DRAWS");
            ps.setString(5, chitId + ":CLOSE_DRAWS");
            ps.executeUpdate();
        }
    }
}
