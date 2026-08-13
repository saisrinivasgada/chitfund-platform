ALTER TABLE users ADD COLUMN has_app_access BOOLEAN NOT NULL DEFAULT FALSE;

-- Members who already had a login explicitly created have a non-auto-generated username.
-- Auto-generated usernames follow the pattern m_<digits> (e.g. m_9876543210).
-- Mark those members as already having app access so existing data is consistent.
UPDATE users SET has_app_access = TRUE
WHERE role = 'MEMBER'
  AND username IS NOT NULL
  AND username NOT REGEXP '^m_[0-9]+(_[0-9]+)?$';
