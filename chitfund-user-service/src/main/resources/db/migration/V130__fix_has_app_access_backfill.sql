-- V129 used pattern '^m_[0-9]+' but auto-generated usernames are 'm<digits>' (no underscore).
-- This caused all auto-generated-username members to be incorrectly marked as having app access.
-- Reset them to FALSE; only members with explicitly created logins (custom usernames) keep TRUE.
UPDATE users SET has_app_access = FALSE
WHERE role = 'MEMBER'
  AND username REGEXP '^m_?[0-9]+(_[0-9]+)?$';
