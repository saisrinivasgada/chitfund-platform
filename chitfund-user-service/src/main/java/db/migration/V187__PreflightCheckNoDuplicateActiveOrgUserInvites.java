package db.migration;

import org.flywaydb.core.api.FlywayException;
import org.flywaydb.core.api.migration.BaseJavaMigration;
import org.flywaydb.core.api.migration.Context;

import java.sql.ResultSet;
import java.sql.Statement;

/**
 * V187 deployment preflight — read-only guard against duplicate active invite tokens.
 *
 * WHY this exists:
 * V186 added a generated-column UNIQUE INDEX on (user_id, active_invite_marker) so
 * that only one active ORG_USER_INVITE token can exist per user at a time. The index
 * is a DB-level backstop; the application layer relies on it in resendOrgUserSetup()
 * and complete(). If duplicate active tokens already exist when the deployment lands,
 * those rows would bypass the constraint (pre-existing rows are not revalidated),
 * leaving the application in an inconsistent state.
 *
 * This migration aborts the deployment if any user has more than one active
 * (unused, unexpired) ORG_USER_INVITE token, giving the operator a chance to
 * clean up data before proceeding.
 *
 * Safety properties:
 * - Read-only: no writes to any table.
 * - Privacy-preserving: only the affected count is reported, never user IDs or tokens.
 * - Idempotent: safe to re-run after cleanup; passes immediately when count is zero.
 */
public class V187__PreflightCheckNoDuplicateActiveOrgUserInvites extends BaseJavaMigration {

    @Override
    public void migrate(Context context) throws Exception {
        try (Statement stmt = context.getConnection().createStatement();
             ResultSet rs = stmt.executeQuery(
                     "SELECT COUNT(*) " +
                     "FROM (" +
                     "  SELECT user_id " +
                     "  FROM account_setup_tokens " +
                     "  WHERE purpose = 'ORG_USER_INVITE' " +
                     "    AND used_at IS NULL " +
                     "    AND expires_at > NOW() " +
                     "  GROUP BY user_id " +
                     "  HAVING COUNT(*) > 1" +
                     ") AS users_with_duplicate_active_invites")) {
            if (rs.next()) {
                int affectedUserCount = rs.getInt(1);
                if (affectedUserCount > 0) {
                    throw new FlywayException(
                            "V187 preflight FAILED: " + affectedUserCount +
                            " user(s) have more than one active ORG_USER_INVITE token. " +
                            "Revoke the extras before deploying this version. " +
                            "Diagnostic query (run as DBA — output contains user IDs): " +
                            "SELECT user_id, COUNT(*) AS active_count " +
                            "FROM account_setup_tokens " +
                            "WHERE purpose = 'ORG_USER_INVITE' AND used_at IS NULL AND expires_at > NOW() " +
                            "GROUP BY user_id HAVING active_count > 1");
                }
            }
        }
    }
}
