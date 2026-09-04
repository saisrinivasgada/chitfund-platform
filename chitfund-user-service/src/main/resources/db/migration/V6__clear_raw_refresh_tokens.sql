-- Clear all existing refresh tokens stored as raw UUIDs.
-- After this migration, the application hashes tokens with SHA-256 before storing,
-- so any raw tokens in the DB can never match a lookup and represent stale risk.
-- Active sessions will need to re-authenticate once after this deployment.
TRUNCATE TABLE refresh_tokens;
