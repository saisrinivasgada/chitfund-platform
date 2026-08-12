package com.chitfund.memberservice.db.migration;

import org.flywaydb.core.api.migration.BaseJavaMigration;
import org.flywaydb.core.api.migration.Context;
import org.springframework.stereotype.Component;

import java.sql.*;

@Component
public class V8__AddTenantIdToMembers extends BaseJavaMigration {

    private static final String DEFAULT_TENANT = "10000000-0000-0000-0000-000000000001";

    @Override
    public void migrate(Context context) throws Exception {
        Connection conn = context.getConnection();

        if (!columnExists(conn, "members", "tenant_id")) {
            try (Statement st = conn.createStatement()) {
                st.execute("ALTER TABLE members ADD COLUMN tenant_id VARCHAR(36) NOT NULL " +
                        "DEFAULT '" + DEFAULT_TENANT + "' AFTER id");
            }
        }

        for (String idx : new String[]{"uk_member_phone", "uq_member_phone", "uk_members_phone"}) {
            if (indexExists(conn, "members", idx)) {
                try (Statement st = conn.createStatement()) {
                    st.execute("ALTER TABLE members DROP INDEX " + idx);
                }
            }
        }

        if (!indexExists(conn, "members", "uk_member_phone_tenant")) {
            try (Statement st = conn.createStatement()) {
                st.execute("CREATE UNIQUE INDEX uk_member_phone_tenant " +
                        "ON members(phone, phone_country_code, tenant_id)");
            }
        }

        if (!indexExists(conn, "members", "idx_members_tenant")) {
            try (Statement st = conn.createStatement()) {
                st.execute("CREATE INDEX idx_members_tenant ON members(tenant_id)");
            }
        }
    }

    private boolean columnExists(Connection conn, String table, String column) throws SQLException {
        try (PreparedStatement ps = conn.prepareStatement(
                "SELECT COUNT(*) FROM information_schema.columns " +
                "WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?")) {
            ps.setString(1, table);
            ps.setString(2, column);
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next() && rs.getInt(1) > 0;
            }
        }
    }

    private boolean indexExists(Connection conn, String table, String index) throws SQLException {
        try (PreparedStatement ps = conn.prepareStatement(
                "SELECT COUNT(*) FROM information_schema.statistics " +
                "WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ?")) {
            ps.setString(1, table);
            ps.setString(2, index);
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next() && rs.getInt(1) > 0;
            }
        }
    }
}
