-- Track when each org-user completed their account setup.
-- NULL = setup not yet completed; NOT NULL = setup done.
-- This replaces the isSetupPending DB query (existsActiveOrgUserInvite) with
-- a simple column read, and allows "resend" to work even after an invite expires.

ALTER TABLE users
    ADD COLUMN org_user_setup_completed_at DATETIME(6) NULL DEFAULT NULL
    AFTER terms_version;

-- Back-fill: users who have already accepted terms have completed setup.
UPDATE users
SET org_user_setup_completed_at = terms_accepted_at
WHERE terms_accepted_at IS NOT NULL
  AND org_user_setup_completed_at IS NULL;
