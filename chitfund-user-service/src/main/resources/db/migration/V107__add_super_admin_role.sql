-- Add SUPER_ADMIN as a valid role value
-- MySQL ENUM: add new value without rebuilding table (ALTER COLUMN approach)
-- Since role is VARCHAR(20) in this schema, no ENUM change needed — just update the row.

-- Promote the primary admin account to SUPER_ADMIN
-- This removes them from tenant-scoped operations; they manage all tenants via /super-admin/**
UPDATE users
SET role = 'SUPER_ADMIN', updated_at = NOW()
WHERE username = 'admin'
  AND role = 'ADMIN'
LIMIT 1;

-- Remove SUPER_ADMIN from user_tenant_memberships (they are global, not tenant-scoped)
DELETE FROM user_tenant_memberships
WHERE user_id = (SELECT id FROM users WHERE role = 'SUPER_ADMIN' LIMIT 1);
