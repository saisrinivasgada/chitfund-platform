-- Add tenant_id column (idempotent — safe to re-run if partially applied)
SET @addCol = (SELECT IF(
    EXISTS(SELECT 1 FROM information_schema.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'admin_wallet' AND COLUMN_NAME = 'tenant_id'),
    'SELECT 1 /* tenant_id already exists */',
    'ALTER TABLE admin_wallet ADD COLUMN tenant_id VARCHAR(36) NOT NULL DEFAULT \'\' AFTER id'
));
PREPARE stmt FROM @addCol;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add index (idempotent — safe to re-run if column was added but index was not)
SET @addIdx = (SELECT IF(
    EXISTS(SELECT 1 FROM information_schema.STATISTICS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'admin_wallet' AND INDEX_NAME = 'idx_wallet_tenant'),
    'SELECT 2 /* idx_wallet_tenant already exists */',
    'CREATE INDEX idx_wallet_tenant ON admin_wallet (tenant_id)'
));
PREPARE stmt FROM @addIdx;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
