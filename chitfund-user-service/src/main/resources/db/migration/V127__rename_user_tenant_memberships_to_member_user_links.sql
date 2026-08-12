-- Rename table and slim it down:
-- Drop 'role' column (redundant — role lives on users.role)
-- Keep: id, user_id, tenant_id, member_id, created_at
-- Delete non-MEMBER rows (ADMIN/MANAGER/STAFF have no member_id and don't need a link row)

RENAME TABLE user_tenant_memberships TO member_user_links;

ALTER TABLE member_user_links DROP COLUMN role;

DELETE FROM member_user_links WHERE member_id IS NULL;
