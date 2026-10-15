-- Drop the legacy has_app_access column from members.
-- Row existence in member_user_links is now the sole source of truth for app access;
-- the member service no longer reads or writes this column.
ALTER TABLE members DROP COLUMN IF EXISTS has_app_access;
