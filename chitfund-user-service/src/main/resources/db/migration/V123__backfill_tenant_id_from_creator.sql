-- Fix staff accounts that were created before the membership-table era
-- and therefore have no tenant_id after V122's backfill.
-- Strategy: the creator (created_by) is always an admin who belongs to the same tenant,
-- so we can safely inherit their tenant_id.
UPDATE users u
INNER JOIN users creator ON creator.id = u.created_by
SET u.tenant_id = creator.tenant_id
WHERE u.role IN ('ADMIN', 'MANAGER', 'STAFF', 'AGENT')
  AND u.tenant_id IS NULL
  AND creator.tenant_id IS NOT NULL;
