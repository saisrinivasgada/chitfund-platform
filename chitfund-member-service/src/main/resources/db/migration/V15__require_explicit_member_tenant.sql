-- Historical migrations used a tenant default only to backfill legacy rows.
-- New member writes must always provide their authenticated organization.
ALTER TABLE members ALTER COLUMN tenant_id DROP DEFAULT;
