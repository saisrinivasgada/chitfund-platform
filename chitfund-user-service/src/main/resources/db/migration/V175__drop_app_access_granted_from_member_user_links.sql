-- Drop the app_access_granted mirror column from member_user_links.
-- Row existence in this table is now the sole source of truth for app access;
-- a row present = access granted, deleted row = access revoked.
ALTER TABLE member_user_links DROP COLUMN IF EXISTS app_access_granted;
