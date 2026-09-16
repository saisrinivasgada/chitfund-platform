-- Treasury rows must never be assigned to an implicit empty tenant.
ALTER TABLE admin_wallet ALTER COLUMN tenant_id DROP DEFAULT;
