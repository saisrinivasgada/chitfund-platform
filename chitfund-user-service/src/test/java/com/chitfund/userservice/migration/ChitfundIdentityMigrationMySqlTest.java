package com.chitfund.userservice.migration;

import com.chitfund.common.outbox.DurableAuditOutbox;
import com.chitfund.common.outbox.DurableEventOutbox;
import com.chitfund.userservice.client.AuditClient;
import com.chitfund.userservice.outbox.MemberActivationCommandOutbox;
import com.fasterxml.jackson.databind.ObjectMapper;
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
class ChitfundIdentityMigrationMySqlTest {
    @Container
    static final MySQLContainer<?> MYSQL = new MySQLContainer<>("mysql:8.0")
            .withDatabaseName("chitfund_users")
            .withUsername("chitfund")
            .withPassword("testpassword");

    @Test
    void migrationsEnforceOneOpenRequestPerTenantMemberAndAllowCrossTenantLinks() throws Exception {
        Flyway.configure().dataSource(MYSQL.getJdbcUrl(), MYSQL.getUsername(), MYSQL.getPassword())
                .locations("classpath:db/migration").load().migrate();

        try (var connection = DriverManager.getConnection(MYSQL.getJdbcUrl(), MYSQL.getUsername(), MYSQL.getPassword())) {
            String insertRequest = "INSERT INTO chitfund_access_requests " +
                    "(id,tenant_id,member_id,requested_phone,phone_country_code,candidate_user_id,request_kind,status,expires_at,last_sent_at,version) " +
                    "VALUES (?,?,?,?,? ,?,?,?,DATE_ADD(NOW(), INTERVAL 1 DAY),NOW(),0)";
            insertRequest(connection, insertRequest, "00000000-0000-0000-0000-000000000001",
                    "10000000-0000-0000-0000-000000000001", "20000000-0000-0000-0000-000000000001");
            assertThatThrownBy(() -> insertRequest(connection, insertRequest,
                    "00000000-0000-0000-0000-000000000002",
                    "10000000-0000-0000-0000-000000000001", "20000000-0000-0000-0000-000000000001"))
                    .isInstanceOf(SQLException.class);

            connection.createStatement().executeUpdate("UPDATE chitfund_access_requests SET status='REVOKED' WHERE id='00000000-0000-0000-0000-000000000001'");
            insertRequest(connection, insertRequest, "00000000-0000-0000-0000-000000000003",
                    "10000000-0000-0000-0000-000000000001", "20000000-0000-0000-0000-000000000001");
            insertRequest(connection, insertRequest, "00000000-0000-0000-0000-000000000004",
                    "10000000-0000-0000-0000-000000000002", "20000000-0000-0000-0000-000000000001");

            String linkSql = "INSERT INTO member_user_links(id,user_id,tenant_id,member_id,created_at) VALUES (?,?,?,?,NOW())";
            try (var ps = connection.prepareStatement(linkSql)) {
                for (int i = 1; i <= 2; i++) {
                    ps.setString(1, "30000000-0000-0000-0000-00000000000" + i);
                    ps.setString(2, "40000000-0000-0000-0000-000000000001");
                    ps.setString(3, "50000000-0000-0000-0000-00000000000" + i);
                    ps.setString(4, "60000000-0000-0000-0000-00000000000" + i);
                    ps.executeUpdate();
                }
            }
            try (var rows = connection.createStatement().executeQuery("SELECT COUNT(*) FROM member_user_links WHERE user_id='40000000-0000-0000-0000-000000000001'")) {
                assertThat(rows.next()).isTrue();
                assertThat(rows.getInt(1)).isEqualTo(2);
            }

            assertThatThrownBy(() -> {
                try (var ps = connection.prepareStatement(linkSql)) {
                    ps.setString(1, "30000000-0000-0000-0000-000000000003");
                    ps.setString(2, "40000000-0000-0000-0000-000000000002");
                    ps.setString(3, "50000000-0000-0000-0000-000000000001");
                    ps.setString(4, "60000000-0000-0000-0000-000000000001");
                    ps.executeUpdate();
                }
            }).isInstanceOf(SQLException.class);

            try (var columns = connection.createStatement().executeQuery(
                    "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() " +
                            "AND table_name='account_setup_tokens' AND column_name='chitfund_request_id'")) {
                assertThat(columns.next()).isTrue();
                assertThat(columns.getInt(1)).isEqualTo(1);
            }

            try (var plan = connection.createStatement().executeQuery(
                    "SELECT allowed_chit_types FROM plan_limits WHERE plan='GROWTH'")) {
                assertThat(plan.next()).isTrue();
                assertThat(plan.getString(1)).isEqualTo("RESERVATION");
            }
            try (var limits = connection.createStatement().executeQuery(
                    "SELECT allowed_chit_types FROM tenant_custom_limits " +
                            "WHERE tenant_id='10000000-0000-0000-0000-000000000001'")) {
                assertThat(limits.next()).isTrue();
                assertThat(limits.getString(1)).isEqualTo("RESERVATION");
            }

            String userSql = "INSERT INTO users(id,username,password_hash,role,phone,phone_country_code,enabled,locked,failed_login_attempts,must_change_password,has_app_access,created_at,updated_at) " +
                    "VALUES(?,?,?,?,?,?,TRUE,FALSE,0,FALSE,TRUE,NOW(),NOW())";
            insertUser(connection, userSql, "80000000-0000-0000-0000-000000000001", "phone-owner-1", "MEMBER");
            assertThatThrownBy(() -> insertUser(connection, userSql,
                    "80000000-0000-0000-0000-000000000002", "phone-owner-2", "MEMBER"))
                    .isInstanceOf(SQLException.class);
            insertUser(connection, userSql, "80000000-0000-0000-0000-000000000003", "staff-same-phone", "STAFF");
        }
    }

    @Test
    void auditOutboxEntryCommitsAndRollsBackWithTheBusinessTransaction() {
        Flyway.configure().dataSource(MYSQL.getJdbcUrl(), MYSQL.getUsername(), MYSQL.getPassword())
                .locations("classpath:db/migration").load().migrate();
        var dataSource = new DriverManagerDataSource(
                MYSQL.getJdbcUrl(), MYSQL.getUsername(), MYSQL.getPassword());
        var jdbc = new JdbcTemplate(dataSource);
        var transactions = new TransactionTemplate(new DataSourceTransactionManager(dataSource));
        var auditClient = new AuditClient(new DurableAuditOutbox(jdbc), new ObjectMapper());
        jdbc.update("DELETE FROM audit_event_outbox");

        transactions.executeWithoutResult(status -> {
            auditClient.log("TENANT", "tenant-entity", "STATUS_CHANGED", "actor", "ADMIN",
                    null, java.util.Map.of("status", "ACTIVE"), "tenant-id");
            status.setRollbackOnly();
        });
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM audit_event_outbox", Long.class))
                .isZero();

        transactions.executeWithoutResult(status -> auditClient.log(
                "TENANT", "tenant-entity", "STATUS_CHANGED", "actor", "ADMIN",
                null, java.util.Map.of("status", "ACTIVE"), "tenant-id"));
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM audit_event_outbox", Long.class))
                .isEqualTo(1L);
    }

    @Test
    void domainEventOutboxEntryCommitsAndRollsBackWithTheBusinessTransaction() {
        Flyway.configure().dataSource(MYSQL.getJdbcUrl(), MYSQL.getUsername(), MYSQL.getPassword())
                .locations("classpath:db/migration").load().migrate();
        var dataSource = new DriverManagerDataSource(
                MYSQL.getJdbcUrl(), MYSQL.getUsername(), MYSQL.getPassword());
        var jdbc = new JdbcTemplate(dataSource);
        var transactions = new TransactionTemplate(new DataSourceTransactionManager(dataSource));
        var outbox = new DurableEventOutbox(jdbc);
        jdbc.update("DELETE FROM domain_event_outbox");

        transactions.executeWithoutResult(status -> {
            outbox.enqueue("rolled-back-event", "PUSH_NOTIFICATION", "{\"title\":\"Test\"}",
                    "notification-events");
            status.setRollbackOnly();
        });
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM domain_event_outbox", Long.class))
                .isZero();

        transactions.executeWithoutResult(status -> outbox.enqueue(
                "committed-event", "PUSH_NOTIFICATION", "{\"title\":\"Test\"}",
                "notification-events"));
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM domain_event_outbox", Long.class))
                .isEqualTo(1L);
        assertThat(jdbc.queryForObject(
                "SELECT status FROM domain_event_outbox WHERE event_id='committed-event'", String.class))
                .isEqualTo("PENDING");
    }

    @Test
    void memberActivationCommandCommitsAndRollsBackWithTheAccessDecision() {
        Flyway.configure().dataSource(MYSQL.getJdbcUrl(), MYSQL.getUsername(), MYSQL.getPassword())
                .locations("classpath:db/migration").load().migrate();
        var dataSource = new DriverManagerDataSource(
                MYSQL.getJdbcUrl(), MYSQL.getUsername(), MYSQL.getPassword());
        var jdbc = new JdbcTemplate(dataSource);
        var transactions = new TransactionTemplate(new DataSourceTransactionManager(dataSource));
        var outbox = new MemberActivationCommandOutbox(jdbc);
        jdbc.update("DELETE FROM member_activation_command_outbox");
        UUID requestId = UUID.randomUUID();
        UUID tenantId = UUID.randomUUID();
        UUID memberId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();

        transactions.executeWithoutResult(status -> {
            outbox.enqueue(requestId, tenantId, memberId, userId);
            status.setRollbackOnly();
        });
        assertThat(jdbc.queryForObject(
                "SELECT COUNT(*) FROM member_activation_command_outbox", Long.class)).isZero();

        transactions.executeWithoutResult(status -> outbox.enqueue(requestId, tenantId, memberId, userId));
        transactions.executeWithoutResult(status -> outbox.enqueue(requestId, tenantId, memberId, userId));
        assertThat(jdbc.queryForObject(
                "SELECT COUNT(*) FROM member_activation_command_outbox", Long.class)).isEqualTo(1L);
        assertThat(jdbc.queryForObject(
                "SELECT status FROM member_activation_command_outbox WHERE request_id=?",
                String.class, requestId.toString())).isEqualTo("PENDING");
    }

    private static void insertRequest(java.sql.Connection connection, String sql, String id,
                                      String tenantId, String memberId) throws SQLException {
        try (var ps = connection.prepareStatement(sql)) {
            ps.setString(1, id); ps.setString(2, tenantId); ps.setString(3, memberId);
            ps.setString(4, "9876543210"); ps.setString(5, "+91");
            ps.setString(6, "70000000-0000-0000-0000-000000000001");
            ps.setString(7, "LINK_EXISTING"); ps.setString(8, "PENDING_MEMBER");
            ps.executeUpdate();
        }
    }

    private static void insertUser(java.sql.Connection connection, String sql, String id,
                                   String username, String role) throws SQLException {
        try (var ps = connection.prepareStatement(sql)) {
            ps.setString(1, id); ps.setString(2, username); ps.setString(3, "password-hash");
            ps.setString(4, role); ps.setString(5, "9123456789"); ps.setString(6, "+91");
            ps.executeUpdate();
        }
    }
}
