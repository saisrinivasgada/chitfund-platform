package com.chitfund.chitservice.migration;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.MySQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.sql.DriverManager;
import java.sql.SQLException;

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
}
