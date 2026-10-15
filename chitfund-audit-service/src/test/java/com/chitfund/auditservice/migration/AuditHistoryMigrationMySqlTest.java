package com.chitfund.auditservice.migration;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.MySQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.sql.DriverManager;
import static org.assertj.core.api.Assertions.assertThat;

@Testcontainers(disabledWithoutDocker = true)
class AuditHistoryMigrationMySqlTest {

    @Container
    static final MySQLContainer<?> MYSQL = new MySQLContainer<>("mysql:8.0")
            .withDatabaseName("chitfund_audit")
            .withUsername("chitfund")
            .withPassword("testpassword")
            // Production-style Flyway users deliberately do not have SUPER. MySQL
            // requires this server setting to let such a user create the two
            // append-only triggers while binary logging is enabled. deploy.yml
            // checks the same prerequisite before any service is restarted.
            .withCommand("--log-bin-trust-function-creators=1");

    @Test
    void migrationEnrichesAuditHistoryAndBuildsTimelineIndexes() throws Exception {
        var result = Flyway.configure()
                .dataSource(MYSQL.getJdbcUrl(), MYSQL.getUsername(), MYSQL.getPassword())
                .locations("classpath:db/migration")
                .load()
                .migrate();
        assertThat(result.migrationsExecuted).isEqualTo(7);

        try (var connection = DriverManager.getConnection(
                MYSQL.getJdbcUrl(), MYSQL.getUsername(), MYSQL.getPassword())) {
            String longEntityId = "member-organization-link:" + "x".repeat(60);
            try (var ps = connection.prepareStatement("""
                    INSERT INTO audit_logs
                      (id, tenant_id, service_name, entity_type, entity_id, action,
                       source, outcome, correlation_id, occurred_at, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(6), NOW(6))
                    """)) {
                ps.setString(1, "11111111-1111-1111-1111-111111111111");
                ps.setString(2, "22222222-2222-2222-2222-222222222222");
                ps.setString(3, "member-service");
                ps.setString(4, "MEMBER_USER_LINK");
                ps.setString(5, longEntityId);
                ps.setString(6, "LINK_ACTIVATED");
                ps.setString(7, "MOBILE");
                ps.setString(8, "SUCCESS");
                ps.setString(9, "request-123");
                assertThat(ps.executeUpdate()).isOne();
            }

            try (var rows = connection.createStatement().executeQuery("""
                    SELECT entity_id, source, outcome, occurred_at, created_at
                    FROM audit_logs
                    WHERE id = '11111111-1111-1111-1111-111111111111'
                    """)) {
                assertThat(rows.next()).isTrue();
                assertThat(rows.getString("entity_id")).isEqualTo(longEntityId);
                assertThat(rows.getString("source")).isEqualTo("MOBILE");
                assertThat(rows.getString("outcome")).isEqualTo("SUCCESS");
                assertThat(rows.getTimestamp("occurred_at")).isNotNull();
                assertThat(rows.getTimestamp("created_at")).isNotNull();
            }

            try (var indexes = connection.createStatement().executeQuery("""
                    SELECT COUNT(*)
                    FROM information_schema.statistics
                    WHERE table_schema = DATABASE()
                      AND table_name = 'audit_logs'
                      AND index_name IN ('idx_audit_tenant_occurred',
                                         'idx_audit_tenant_outcome',
                                         'idx_audit_correlation',
                                         'idx_audit_idempotency',
                                         'idx_audit_tenant_created')
                    """)) {
                assertThat(indexes.next()).isTrue();
                assertThat(indexes.getInt(1)).isGreaterThanOrEqualTo(5);
            }

            org.assertj.core.api.Assertions.assertThatThrownBy(() ->
                    connection.createStatement().executeUpdate("""
                            UPDATE audit_logs SET action = 'HISTORY_REWRITTEN'
                            WHERE id = '11111111-1111-1111-1111-111111111111'
                            """))
                    .hasMessageContaining("audit_logs is append-only");

            org.assertj.core.api.Assertions.assertThatThrownBy(() ->
                    connection.createStatement().executeUpdate("""
                            DELETE FROM audit_logs
                            WHERE id = '11111111-1111-1111-1111-111111111111'
                            """))
                    .hasMessageContaining("audit_logs is append-only");
        }
    }
}
