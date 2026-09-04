-- V9: Disable the known-compromised seeded account and add bootstrap infrastructure.
--
-- PROBLEM: V3 seeded EMP-001 with a publicly documented bcrypt hash for "Password@1".
-- That hash appears in Git history and in this codebase. Every environment that ran V3
-- is compromised until this migration runs.
--
-- STRATEGY (forward-only, safe to run on existing databases):
--   1. Invalidate the known password hash by replacing it with an impossible value.
--   2. Deactivate the account until a legitimate operator resets it through the
--      admin-console or emergency recovery procedure.
--   3. Create a bootstrap_config table for the first-super-admin setup flow.
--      The application uses this table to:
--        a. Record that bootstrap is in progress (prevents races).
--        b. Store the setup-token HMAC so the one-time invite link can be validated.
--        c. Mark bootstrap permanently complete once a legitimate SUPER_ADMIN activates.
--
-- DEPLOYMENT ORDER:
--   Apply this migration BEFORE deploying application code that reads bootstrap_config.
--   The migration is idempotent: repeated runs are safe (WHERE NOT EXISTS guards).
--
-- PRODUCTION MANUAL STEPS REQUIRED AFTER THIS MIGRATION:
--   See SECURITY_RUNBOOK.md for the complete procedure to create the first legitimate
--   SUPER_ADMIN using the bootstrap API and then remove the BOOTSTRAP_SECRET env var.

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 1: Invalidate the known password hash for EMP-001.
--   We replace the bcrypt hash with a marker value that can never be the output
--   of BCryptPasswordEncoder — the '*COMPROMISED*' prefix is not valid bcrypt.
--   This means EMP-001 cannot authenticate with any password until the operator
--   explicitly sets a new secure password through the admin console.
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE employees
SET
    password_hash   = '*COMPROMISED-CREDENTIAL-DISABLED-BY-V9-MIGRATION*',
    is_active       = 0,
    updated_at      = NOW()
WHERE id = 'EMP-001'
  AND password_hash = '$2b$12$gU9KnFzFGGZ8Y9DSRlRuleNIv4cPCDt5oQM4nTHjPVtnRHZw7bpMm';
-- Note: the WHERE clause on the known hash means this UPDATE is a no-op if the
-- password was already changed legitimately. It will not lock out an operator who
-- already rotated EMP-001's credentials.

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 2: Create the bootstrap_config table.
--   One row exists during bootstrap; it is permanently sealed once complete.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bootstrap_config (
    id                  CHAR(36)     NOT NULL DEFAULT (UUID()),
    state               ENUM('PENDING','TOKEN_SENT','COMPLETE') NOT NULL DEFAULT 'PENDING',
    target_email        VARCHAR(255) NOT NULL,
    setup_token_hmac    VARCHAR(64)          ,  -- HMAC-SHA256 hex; NULL until token generated
    token_expires_at    DATETIME             ,  -- NULL until token generated
    token_used_at       DATETIME             ,  -- NULL until token consumed
    initiated_by_host   VARCHAR(255)         ,  -- IP/hostname that triggered bootstrap
    initiated_at        DATETIME     NOT NULL DEFAULT NOW(),
    completed_at        DATETIME             ,
    created_at          DATETIME     NOT NULL DEFAULT NOW(),
    updated_at          DATETIME     NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Index to quickly look up active bootstrap sessions
CREATE INDEX IF NOT EXISTS idx_bootstrap_state ON bootstrap_config(state);
