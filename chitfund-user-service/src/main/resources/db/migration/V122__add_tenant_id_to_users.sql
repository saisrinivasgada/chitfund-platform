-- Store tenant_id directly on users row for staff accounts.
-- Staff (MANAGER, STAFF, AGENT, ADMIN) belong to exactly one tenant;
-- this avoids querying user_tenant_memberships for every staff list/count operation.
ALTER TABLE users ADD COLUMN tenant_id CHAR(36) NULL;

-- Backfill existing staff from the memberships table
UPDATE users u
INNER JOIN user_tenant_memberships m ON m.user_id = u.id
SET u.tenant_id = m.tenant_id
WHERE u.role IN ('ADMIN', 'MANAGER', 'STAFF', 'AGENT')
  AND u.deleted_at IS NULL;

CREATE INDEX idx_users_tenant_role ON users (tenant_id, role);
