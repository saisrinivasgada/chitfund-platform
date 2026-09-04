-- Refresh tokens were previously stored as plaintext values.
-- They are now stored as SHA-256 hashes. Existing plaintext rows cannot
-- be migrated (the raw values are gone), so all active sessions are
-- invalidated here. Users will be prompted to log in again.
-- V6 contains the same intent but is out-of-order; this migration runs instead.
DELETE FROM refresh_tokens;
