package com.chitfund.userservice.migration;

import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.FlywayException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.MySQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Verifies V186 (enforce at most one active ORG_USER_INVITE per user):
 *
 * 1. Clean data (no duplicates) → migration succeeds, index created.
 * 2. Duplicate active invites exist → preflight aborts with FlywayException.
 * 3. After revoking duplicates → migration succeeds.
 * 4. Post-migration INSERT of a second active invite → constraint fires.
 */
@Testcontainers
class V186MigrationMySqlTest {

    @Container
    static final MySQLContainer<?> MYSQL = new MySQLContainer<>("mysql:8.0")
            .withDatabaseName("v186_migration_test")
            .withUsername("test")
            .withPassword("testpassword");

    private static final DateTimeFormatter SQL_DT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    private Flyway flyway(String target) {
        return Flyway.configure()
                .dataSource(MYSQL.getJdbcUrl(), MYSQL.getUsername(), MYSQL.getPassword())
                .locations("classpath:db/migration", "classpath:db.migration")
                .cleanDisabled(false)
                .target(target)
                .load();
    }

    @BeforeEach
    void reset() {
        flyway("latest").clean();
    }

    // ── Test 1: clean data → migration succeeds ───────────────────────────────

    @Test
    void v186_succeedsOnCleanData() throws Exception {
        flyway("185").migrate();
        try (Connection conn = DriverManager.getConnection(
                MYSQL.getJdbcUrl(), MYSQL.getUsername(), MYSQL.getPassword())) {

            // One active invite per user — no duplicates
            String userId = UUID.randomUUID().toString();
            insertUser(conn, userId);
            insertInvite(conn, userId, false);

            // Should succeed without error
            flyway("186").migrate();
            flyway("186").validate();

            // Index exists
            ResultSet rs = conn.createStatement().executeQuery(
                    "SHOW INDEX FROM account_setup_tokens WHERE Key_name = 'uk_ast_one_active_invite'");
            assertThat(rs.next()).isTrue();
        }
    }

    // ── Test 2: duplicate active invites → preflight aborts ──────────────────

    @Test
    void v186_blocksWhenDuplicateActiveInviteExists() throws Exception {
        flyway("185").migrate();
        try (Connection conn = DriverManager.getConnection(
                MYSQL.getJdbcUrl(), MYSQL.getUsername(), MYSQL.getPassword())) {

            String userId = UUID.randomUUID().toString();
            insertUser(conn, userId);
            // Two unused invites for the same user
            insertInvite(conn, userId, false);
            insertInvite(conn, userId, false);

            assertThatThrownBy(() -> flyway("186").migrate())
                    .isInstanceOf(FlywayException.class)
                    .hasStackTraceContaining("V186 preflight FAILED");
        }
    }

    // ── Test 3: expired-but-unused tokens also count (constraint covers them) ─

    @Test
    void v186_blocksWhenExpiredUnusedDuplicatesExist() throws Exception {
        flyway("185").migrate();
        try (Connection conn = DriverManager.getConnection(
                MYSQL.getJdbcUrl(), MYSQL.getUsername(), MYSQL.getPassword())) {

            String userId = UUID.randomUUID().toString();
            insertUser(conn, userId);
            // One active, one expired-but-unused — both are used_at IS NULL
            insertInvite(conn, userId, false);
            insertExpiredInvite(conn, userId);

            assertThatThrownBy(() -> flyway("186").migrate())
                    .isInstanceOf(FlywayException.class)
                    .hasStackTraceContaining("V186 preflight FAILED");
        }
    }

    // ── Test 4: after cleanup → migration succeeds, constraint enforced ───────

    @Test
    void v186_succeedsAfterCleanupAndConstraintEnforcedAfterwards() throws Exception {
        flyway("185").migrate();
        try (Connection conn = DriverManager.getConnection(
                MYSQL.getJdbcUrl(), MYSQL.getUsername(), MYSQL.getPassword())) {

            String userId = UUID.randomUUID().toString();
            insertUser(conn, userId);
            String tokenHash1 = insertInvite(conn, userId, false);
            insertInvite(conn, userId, false);

            // Revoke the first token (set used_at)
            conn.createStatement().executeUpdate(
                    "UPDATE account_setup_tokens SET used_at = NOW() WHERE token_hash = '" + tokenHash1 + "'");

            // Now exactly one unused invite — migration should succeed
            flyway("186").migrate();
            flyway("186").validate();

            // Constraint rejects a second active invite
            assertThatThrownBy(() -> insertInvite(conn, userId, false))
                    .isInstanceOf(Exception.class);
        }
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private void insertUser(Connection conn, String userId) throws Exception {
        conn.createStatement().executeUpdate(
                "INSERT INTO users (id, username, full_name, password_hash, role, created_at, updated_at) VALUES (" +
                "'" + userId + "'," +
                "'user-" + userId.substring(0, 8) + "'," +
                "'Test User'," +
                "'$2a$10$placeholder'," +
                "'MANAGER'," +
                "NOW(), NOW())");
    }

    private String insertInvite(Connection conn, String userId, boolean used) throws Exception {
        String hash = UUID.randomUUID().toString().replace("-", "");
        String usedAt = used ? "NOW()" : "NULL";
        conn.createStatement().executeUpdate(
                "INSERT INTO account_setup_tokens (id, user_id, purpose, token_hash, expires_at, used_at, created_at) VALUES (" +
                "'" + UUID.randomUUID() + "'," +
                "'" + userId + "'," +
                "'ORG_USER_INVITE'," +
                "'" + hash + "'," +
                "DATE_ADD(NOW(), INTERVAL 72 HOUR)," +
                usedAt + "," +
                "NOW())");
        return hash;
    }

    private void insertExpiredInvite(Connection conn, String userId) throws Exception {
        String hash = UUID.randomUUID().toString().replace("-", "");
        conn.createStatement().executeUpdate(
                "INSERT INTO account_setup_tokens (id, user_id, purpose, token_hash, expires_at, used_at, created_at) VALUES (" +
                "'" + UUID.randomUUID() + "'," +
                "'" + userId + "'," +
                "'ORG_USER_INVITE'," +
                "'" + hash + "'," +
                "DATE_SUB(NOW(), INTERVAL 1 HOUR)," +
                "NULL," +
                "NOW())");
    }
}
