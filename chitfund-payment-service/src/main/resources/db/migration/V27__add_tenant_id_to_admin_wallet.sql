ALTER TABLE admin_wallet
    ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(36) NOT NULL DEFAULT '' AFTER id;

CREATE INDEX IF NOT EXISTS idx_wallet_tenant ON admin_wallet (tenant_id);
