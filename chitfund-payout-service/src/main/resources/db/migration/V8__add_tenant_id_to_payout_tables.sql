ALTER TABLE payouts
    ADD COLUMN tenant_id VARCHAR(36) NOT NULL
        DEFAULT '10000000-0000-0000-0000-000000000001'
        AFTER id;
CREATE INDEX idx_payouts_tenant ON payouts(tenant_id);

ALTER TABLE payout_disbursements
    ADD COLUMN tenant_id VARCHAR(36) NOT NULL
        DEFAULT '10000000-0000-0000-0000-000000000001'
        AFTER id;
CREATE INDEX idx_disbursements_tenant ON payout_disbursements(tenant_id);
