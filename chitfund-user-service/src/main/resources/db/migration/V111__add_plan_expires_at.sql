ALTER TABLE tenants
    ADD COLUMN plan_expires_at DATETIME(6) NULL AFTER plan;
