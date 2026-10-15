package com.chitfund.userservice.migration;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.MySQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.util.LinkedHashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

@Testcontainers
class AddOnStorageMigrationMySqlTest {
    @Container
    static final MySQLContainer<?> MYSQL = new MySQLContainer<>("mysql:8.0")
            .withDatabaseName("add_on_migration_test").withUsername("test").withPassword("testpassword");

    private Flyway flyway(String target) {
        return Flyway.configure().dataSource(MYSQL.getJdbcUrl(), MYSQL.getUsername(), MYSQL.getPassword())
                .locations("classpath:db/migration").cleanDisabled(false).target(target).load();
    }

    @BeforeEach
    void resetDisposableDatabase() {
        flyway("latest").clean();
    }

    @Test
    void upgradingPreservesCatalogueAndEveryExistingSelection() throws Exception {
        flyway("180").migrate();
        try (Connection connection = DriverManager.getConnection(MYSQL.getJdbcUrl(), MYSQL.getUsername(), MYSQL.getPassword())) {
            connection.createStatement().executeUpdate(
                    "INSERT INTO plan_capability_defs (`key`,label,sort_order) VALUES ('custom_feature','Custom feature',99)");
            connection.createStatement().executeUpdate(
                    "UPDATE plan_limits SET capabilities='[\"live_chat\",\"custom_feature\"]' WHERE plan='GROWTH'");
            connection.createStatement().executeUpdate(
                    "UPDATE plan_limits SET capabilities=NULL WHERE plan='BASIC'");
            connection.createStatement().executeUpdate(
                    "UPDATE plan_limits SET capabilities='[]' WHERE plan='ENTERPRISE'");
            connection.createStatement().executeUpdate(
                    "INSERT INTO tenant_custom_limits (tenant_id,max_active_chits,max_members,max_staff,capabilities," +
                            "allowed_chit_types,price_monthly_inr,plan_code,created_at,updated_at) " +
                            "VALUES ('10000000-0000-0000-0000-000000000099',3,100,2,'[\"custom_feature\"]'," +
                            "'RESERVATION',0,'CUSTOM',NOW(),NOW())");

            Map<String, String> catalogue = snapshot(connection, "SELECT `key`, CONCAT(label,':',sort_order) FROM plan_capability_defs");
            Map<String, String> plans = snapshot(connection, "SELECT plan, capabilities FROM plan_limits");
            Map<String, String> custom = snapshot(connection, "SELECT tenant_id, capabilities FROM tenant_custom_limits");

            flyway("latest").migrate();
            flyway("latest").validate();

            assertThat(snapshot(connection, "SELECT `key`, CONCAT(label,':',sort_order) FROM plan_add_on_defs")).isEqualTo(catalogue);
            assertThat(snapshot(connection, "SELECT plan, add_ons FROM plan_limits")).isEqualTo(plans);
            assertThat(snapshot(connection, "SELECT tenant_id, add_ons FROM tenant_custom_limits")).isEqualTo(custom);
            assertOldStorageAbsent(connection);
        }
    }

    @Test
    void cleanInstallReachesOnlyTheCurrentStorageNames() throws Exception {
        flyway("latest").migrate();
        flyway("latest").validate();
        try (Connection connection = DriverManager.getConnection(MYSQL.getJdbcUrl(), MYSQL.getUsername(), MYSQL.getPassword())) {
            assertThat(snapshot(connection, "SELECT `key`, label FROM plan_add_on_defs"))
                    .containsKeys("live_chat", "settlement", "full_analytics", "priority_support");
            assertThat(snapshot(connection, "SELECT plan, add_ons FROM plan_limits")).isNotEmpty();
            assertOldStorageAbsent(connection);
        }
    }

    private static Map<String, String> snapshot(Connection connection, String sql) throws Exception {
        Map<String, String> values = new LinkedHashMap<>();
        try (var statement = connection.createStatement(); ResultSet rows = statement.executeQuery(sql)) {
            while (rows.next()) values.put(rows.getString(1), rows.getString(2));
        }
        return values;
    }

    private static void assertOldStorageAbsent(Connection connection) throws Exception {
        try (var statement = connection.createStatement(); var rows = statement.executeQuery(
                "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND " +
                        "(table_name='plan_capability_defs' OR " +
                        "(table_name IN ('plan_limits','tenant_custom_limits') AND column_name='capabilities'))")) {
            assertThat(rows.next()).isTrue();
            assertThat(rows.getInt(1)).isZero();
        }
    }
}
