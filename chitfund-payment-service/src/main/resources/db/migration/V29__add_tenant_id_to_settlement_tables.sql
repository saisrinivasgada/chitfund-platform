-- Add tenant_id to settlement tables for proper multi-tenant isolation.
-- WHY was this missing?
-- Settlement tables were created (V12–V14) before tenant isolation was added
-- to payment_records (V26) and admin_wallet (V27). This backfills the gap.

ALTER TABLE settlements
    ADD COLUMN tenant_id VARCHAR(36) NULL AFTER member_id,
    ADD INDEX idx_settlement_tenant (tenant_id);

ALTER TABLE settlement_chit_items
    ADD COLUMN tenant_id VARCHAR(36) NULL AFTER settlement_id;

ALTER TABLE settlement_payment_transactions
    ADD COLUMN tenant_id VARCHAR(36) NULL AFTER settlement_id;

-- Backfill tenant_id on existing settlement rows by joining payment_records,
-- which already has tenant_id (added in V26). A member's payments all belong
-- to the same tenant, so the first match is always correct.
UPDATE settlements s
INNER JOIN (
    SELECT DISTINCT member_id, tenant_id
    FROM payment_records
    WHERE tenant_id IS NOT NULL
) pr ON pr.member_id = s.member_id
SET s.tenant_id = pr.tenant_id
WHERE s.tenant_id IS NULL;
