ALTER TABLE chits
    ADD COLUMN tenant_id VARCHAR(36) NOT NULL
        DEFAULT '10000000-0000-0000-0000-000000000001'
        AFTER id;
CREATE INDEX idx_chits_tenant ON chits(tenant_id);

ALTER TABLE chit_enrollments
    ADD COLUMN tenant_id VARCHAR(36) NOT NULL
        DEFAULT '10000000-0000-0000-0000-000000000001'
        AFTER id;
CREATE INDEX idx_enrollments_tenant ON chit_enrollments(tenant_id);

ALTER TABLE month_reservations
    ADD COLUMN tenant_id VARCHAR(36) NOT NULL
        DEFAULT '10000000-0000-0000-0000-000000000001'
        AFTER id;
CREATE INDEX idx_reservations_tenant ON month_reservations(tenant_id);

ALTER TABLE monthly_winners
    ADD COLUMN tenant_id VARCHAR(36) NOT NULL
        DEFAULT '10000000-0000-0000-0000-000000000001'
        AFTER id;
CREATE INDEX idx_winners_tenant ON monthly_winners(tenant_id);
