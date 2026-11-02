-- Enforce at most one active (unused) ORG_USER_INVITE token per user at the DB level.
--
-- Strategy: add a stored generated column that is 'Y' for rows where
-- purpose = 'ORG_USER_INVITE' AND used_at IS NULL, and NULL otherwise.
-- NULL values are excluded from UNIQUE indexes in MySQL (InnoDB), so only
-- the single 'Y' case participates in the uniqueness check.
--
-- Combined unique index on (user_id, active_invite_marker) means the engine
-- will reject a second INSERT of an active invite for the same user with a
-- duplicate-key error, even under concurrent transactions that haven't yet
-- committed their revoke step. This is additive — no existing data is
-- modified, and the generated column back-fills instantly from existing rows.
--
-- Application code (TenantService.addOrgUser / resendOrgUserSetup) already
-- revokes prior tokens before inserting a new one. This constraint is the
-- last line of defence against race conditions and bugs.

ALTER TABLE account_setup_tokens
  ADD COLUMN active_invite_marker CHAR(1)
    GENERATED ALWAYS AS (
      IF(purpose = 'ORG_USER_INVITE' AND used_at IS NULL, 'Y', NULL)
    ) STORED
  AFTER purpose;

CREATE UNIQUE INDEX uk_ast_one_active_invite
  ON account_setup_tokens (user_id, active_invite_marker);
