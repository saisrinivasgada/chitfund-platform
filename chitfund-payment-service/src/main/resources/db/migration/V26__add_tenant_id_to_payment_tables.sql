ALTER TABLE chit_month_draws
    ADD COLUMN tenant_id VARCHAR(36) NOT NULL
        DEFAULT '10000000-0000-0000-0000-000000000001'
        AFTER id;
CREATE INDEX idx_draws_tenant ON chit_month_draws(tenant_id);

ALTER TABLE payment_records
    ADD COLUMN tenant_id VARCHAR(36) NOT NULL
        DEFAULT '10000000-0000-0000-0000-000000000001'
        AFTER id;
CREATE INDEX idx_payment_records_tenant ON payment_records(tenant_id);

ALTER TABLE payment_batches
    ADD COLUMN tenant_id VARCHAR(36) NOT NULL
        DEFAULT '10000000-0000-0000-0000-000000000001'
        AFTER id;
CREATE INDEX idx_payment_batches_tenant ON payment_batches(tenant_id);

ALTER TABLE cash_payment_requests
    ADD COLUMN tenant_id VARCHAR(36) NOT NULL
        DEFAULT '10000000-0000-0000-0000-000000000001'
        AFTER id;
CREATE INDEX idx_cash_requests_tenant ON cash_payment_requests(tenant_id);

ALTER TABLE admin_wallet
    ADD COLUMN tenant_id VARCHAR(36) NOT NULL
        DEFAULT '10000000-0000-0000-0000-000000000001'
        AFTER id;
CREATE INDEX idx_wallet_tenant ON admin_wallet(tenant_id);
