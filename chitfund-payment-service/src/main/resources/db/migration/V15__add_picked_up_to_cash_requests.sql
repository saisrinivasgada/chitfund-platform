-- WHY: Adding PICKED_UP status to the cash request lifecycle.
-- Before: PENDING → ASSIGNED → COLLECTED (worker marked as collected immediately)
-- After:  PENDING → ASSIGNED → PICKED_UP → COLLECTED
--
-- PICKED_UP is the worker's proof step: they explicitly confirm they collected cash from
-- the member. If they don't click this, the member's portal still shows "Assigned" —
-- creating an irrefutable audit record. Admin then confirms receipt (COLLECTED).
--
-- Status column is VARCHAR(20) — PICKED_UP fits within that constraint.

ALTER TABLE cash_payment_requests
    ADD COLUMN picked_up_at   DATETIME(6) NULL AFTER assigned_by,
    ADD COLUMN picked_up_by   VARCHAR(36) NULL AFTER picked_up_at;

-- Update comment on status column constraint for documentation
-- (MySQL doesn't support inline column comments via ALTER in all versions,
--  so this is just a migration note)
-- New lifecycle: PENDING | ASSIGNED | PICKED_UP | COLLECTED | CANCELLED
