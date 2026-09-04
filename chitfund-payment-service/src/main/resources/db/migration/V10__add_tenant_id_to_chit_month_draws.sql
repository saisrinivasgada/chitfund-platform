-- Add tenant_id to chit_month_draws for proper multi-tenant isolation.
-- Column is nullable to allow safe rollout; backfilled from payment_records.
ALTER TABLE chit_month_draws
    ADD COLUMN tenant_id VARCHAR(50) NULL AFTER id;

-- Backfill existing rows using chit_id → payment_records (same DB).
-- Rows with no payment records (e.g. AWAITING_AUCTION draws just opened) stay NULL
-- and will be invisible to per-tenant queries until a record is created.
UPDATE chit_month_draws d
    INNER JOIN payment_records p ON p.chit_id = d.chit_id
SET d.tenant_id = p.tenant_id
WHERE d.tenant_id IS NULL;

ALTER TABLE chit_month_draws
    ADD INDEX idx_chit_month_draws_tenant (tenant_id);
