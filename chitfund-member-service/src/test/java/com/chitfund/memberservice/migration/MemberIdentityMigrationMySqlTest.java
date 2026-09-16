package com.chitfund.memberservice.migration;

import com.chitfund.memberservice.db.migration.V8__AddTenantIdToMembers;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.MySQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.sql.DriverManager;
import java.sql.SQLException;

import static org.assertj.core.api.Assertions.assertThatThrownBy;

@Testcontainers
class MemberIdentityMigrationMySqlTest {
    @Container
    static final MySQLContainer<?> MYSQL = new MySQLContainer<>("mysql:8.0")
            .withDatabaseName("chitfund_members").withUsername("chitfund").withPassword("testpassword");

    @Test
    void activePhoneIsUniqueWithinTenantButReusableAcrossTenantsAndAfterDelete() throws Exception {
        Flyway.configure().dataSource(MYSQL.getJdbcUrl(), MYSQL.getUsername(), MYSQL.getPassword())
                .locations("classpath:db/migration")
                .javaMigrations(new V8__AddTenantIdToMembers())
                .load().migrate();
        try (var connection = DriverManager.getConnection(MYSQL.getJdbcUrl(), MYSQL.getUsername(), MYSQL.getPassword())) {
            insert(connection, "10000000-0000-0000-0000-000000000001", "20000000-0000-0000-0000-000000000001", null);
            assertThatThrownBy(() -> insert(connection,
                    "10000000-0000-0000-0000-000000000001", "20000000-0000-0000-0000-000000000002", null))
                    .isInstanceOf(SQLException.class);
            insert(connection, "10000000-0000-0000-0000-000000000002", "20000000-0000-0000-0000-000000000003", null);
            connection.createStatement().executeUpdate("UPDATE members SET deleted_at=NOW() WHERE id='20000000-0000-0000-0000-000000000001'");
            insert(connection, "10000000-0000-0000-0000-000000000001", "20000000-0000-0000-0000-000000000004", null);
            assertThatThrownBy(() -> connection.createStatement().executeUpdate(
                    "INSERT INTO members(id,full_name,phone,phone_country_code,status,created_by,created_at,updated_at,has_app_access) " +
                            "VALUES('20000000-0000-0000-0000-000000000005','No Tenant','9000000000','+91','ACTIVE'," +
                            "'20000000-0000-0000-0000-000000000005',NOW(),NOW(),FALSE)"))
                    .isInstanceOf(SQLException.class);
        }
    }

    private static void insert(java.sql.Connection connection, String tenantId, String id, String deletedAt) throws SQLException {
        String sql = "INSERT INTO members(id,tenant_id,full_name,phone,phone_country_code,status,created_by,created_at,updated_at,deleted_at,has_app_access) " +
                "VALUES(?,?,?,?,?,'ACTIVE',?,NOW(),NOW(),?,FALSE)";
        try (var ps = connection.prepareStatement(sql)) {
            ps.setString(1, id); ps.setString(2, tenantId); ps.setString(3, "Member");
            ps.setString(4, "9876543210"); ps.setString(5, "+91"); ps.setString(6, id);
            ps.setString(7, deletedAt); ps.executeUpdate();
        }
    }
}
