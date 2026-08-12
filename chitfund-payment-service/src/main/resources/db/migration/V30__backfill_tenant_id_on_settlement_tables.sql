-- Backfill tenant_id on settlement rows that have NULL tenant_id.
-- This runs after V29 which added the tenant_id column (nullable).
-- Needed if V29 was applied before the backfill UPDATE was included in it.
--
-- Safe to run even if V29 already backfilled — WHERE tenant_id IS NULL
-- ensures we only touch rows that were missed.

UPDATE settlements s
INNER JOIN (
    SELECT DISTINCT member_id, tenant_id
    FROM payment_records
    WHERE tenant_id IS NOT NULL
) pr ON pr.member_id = s.member_id
SET s.tenant_id = pr.tenant_id
WHERE s.tenant_id IS NULL;

UPDATE settlement_chit_items sci
INNER JOIN settlements s ON s.id = sci.settlement_id
SET sci.tenant_id = s.tenant_id
WHERE sci.tenant_id IS NULL AND s.tenant_id IS NOT NULL;

UPDATE settlement_payment_transactions spt
INNER JOIN settlements s ON s.id = spt.settlement_id
SET spt.tenant_id = s.tenant_id
WHERE spt.tenant_id IS NULL AND s.tenant_id IS NOT NULL;
