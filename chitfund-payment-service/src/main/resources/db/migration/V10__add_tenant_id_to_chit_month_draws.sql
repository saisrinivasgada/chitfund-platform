-- Add tenant_id to chit_month_draws for proper multi-tenant isolation.
-- Column is nullable to allow safe rollout; backfilled from payment_records.
--
-- Made idempotent 2026-09-10. V26 adds tenant_id to this same table, and with
-- `out-of-order: true` either can run first — so whichever came second failed
-- with "Duplicate column name 'tenant_id'". That aborted Flyway and
-- payment-service exited before logging was attached, giving a startup failure
-- with no error in the container log.
--
-- The practical effect was that payment-service could not be built from an empty
-- database at all: a new environment, or a restore from schema, would fail here.
-- Guarding both sides makes the pair order-independent.

SET @col_exists := (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'chit_month_draws'
      AND COLUMN_NAME = 'tenant_id'
);

SET @ddl := IF(@col_exists = 0,
    'ALTER TABLE chit_month_draws ADD COLUMN tenant_id VARCHAR(50) NULL AFTER id',
    'DO 0');
PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;

-- Backfill existing rows using chit_id → payment_records (same DB).
-- Rows with no payment records (e.g. AWAITING_AUCTION draws just opened) stay NULL
-- and will be invisible to per-tenant queries until a record is created.
-- Safe to repeat: it only touches rows still NULL.
--
-- Guarded because payment_records.tenant_id is itself added by V26, which sorts
-- after this file. On an existing database V26 had already run, so the column
-- was there; on an empty one it is not, and this failed with
-- "Unknown column 'p.tenant_id'". Skipping is correct in that case — a fresh
-- database has no rows to backfill.
SET @src_exists := (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'payment_records'
      AND COLUMN_NAME = 'tenant_id'
);

SET @ddl := IF(@src_exists = 1,
    'UPDATE chit_month_draws d
         INNER JOIN payment_records p ON p.chit_id = d.chit_id
     SET d.tenant_id = p.tenant_id
     WHERE d.tenant_id IS NULL',
    'DO 0');
PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;

SET @idx_exists := (
    SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'chit_month_draws'
      AND INDEX_NAME = 'idx_chit_month_draws_tenant'
);

SET @ddl := IF(@idx_exists = 0,
    'ALTER TABLE chit_month_draws ADD INDEX idx_chit_month_draws_tenant (tenant_id)',
    'DO 0');
PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;
