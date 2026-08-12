ALTER TABLE admin_wallet
    ADD COLUMN tenant_id VARCHAR(36) NOT NULL DEFAULT '' AFTER id;

CREATE INDEX idx_wallet_tenant ON admin_wallet (tenant_id);
