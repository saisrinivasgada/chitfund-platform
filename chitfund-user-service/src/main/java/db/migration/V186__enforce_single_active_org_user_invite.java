package db.migration;

import org.flywaydb.core.api.FlywayException;
import org.flywaydb.core.api.migration.BaseJavaMigration;
import org.flywaydb.core.api.migration.Context;

import java.sql.ResultSet;
import java.sql.Statement;

/**
 * V186 — enforce at most one active (unused) ORG_USER_INVITE per user.
 *
 * Step 1 (preflight): abort if any user already has two or more active tokens
 * using the EXACT predicate the generated column will use:
 *   purpose = 'ORG_USER_INVITE' AND used_at IS NULL
 * Expired-but-unused tokens participate in the constraint because the column
 * stores NULL only when a token is used, not when it is expired.
 *
 * Step 2 (DDL): add the generated column + unique index.
 * MySQL validates existing rows when creating the index, so Step 1 must pass
 * before Step 2 can succeed.
 */
public class V186__enforce_single_active_org_user_invite extends BaseJavaMigration {

    @Override
    public void migrate(Context context) throws Exception {
        try (Statement stmt = context.getConnection().createStatement()) {

            // ── Step 1: preflight ─────────────────────────────────────────────
            try (ResultSet rs = stmt.executeQuery(
                    "SELECT COUNT(*) " +
                    "FROM (" +
                    "  SELECT user_id " +
                    "  FROM account_setup_tokens " +
                    "  WHERE purpose = 'ORG_USER_INVITE' " +
                    "    AND used_at IS NULL " +
                    "  GROUP BY user_id " +
                    "  HAVING COUNT(*) > 1" +
                    ") AS users_with_duplicate_unused_invites")) {

                if (rs.next()) {
                    int affected = rs.getInt(1);
                    if (affected > 0) {
                        throw new FlywayException(
                                "V186 preflight FAILED: " + affected +
                                " user(s) have more than one unused ORG_USER_INVITE token. " +
                                "Revoke the extras before deploying this version. " +
                                "Diagnostic query (run as DBA — output contains user IDs): " +
                                "SELECT user_id, COUNT(*) AS cnt " +
                                "FROM account_setup_tokens " +
                                "WHERE purpose = 'ORG_USER_INVITE' AND used_at IS NULL " +
                                "GROUP BY user_id HAVING cnt > 1");
                    }
                }
            }

            // ── Step 2: DDL ───────────────────────────────────────────────────
            stmt.execute(
                    "ALTER TABLE account_setup_tokens " +
                    "ADD COLUMN active_invite_marker CHAR(1) " +
                    "  GENERATED ALWAYS AS (" +
                    "    IF(purpose = 'ORG_USER_INVITE' AND used_at IS NULL, 'Y', NULL)" +
                    "  ) STORED " +
                    "AFTER purpose");

            stmt.execute(
                    "CREATE UNIQUE INDEX uk_ast_one_active_invite " +
                    "ON account_setup_tokens (user_id, active_invite_marker)");
        }
    }
}
