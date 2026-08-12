ALTER TABLE tenants
    ADD COLUMN renewal_requested_at DATETIME NULL AFTER upgrade_requested_at;
