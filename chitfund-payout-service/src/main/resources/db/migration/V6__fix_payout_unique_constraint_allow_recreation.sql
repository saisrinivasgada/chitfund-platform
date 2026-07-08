-- The original uk_payout_chit_month unique key blocked re-creating a payout for the same
-- chit+month after the previous one was CANCELLED or VOIDED. The service-level check correctly
-- excludes those statuses, but the DB constraint did not — causing a duplicate key error on INSERT.
--
-- Fix: drop the old hard unique key and replace it with a virtual column that is NULL for
-- CANCELLED/VOIDED rows. MySQL allows multiple NULLs in a unique index, so only one
-- active (PENDING / DISBURSED / PARTIALLY_DISBURSED) payout per chit+month is enforced.

ALTER TABLE payouts DROP INDEX uk_payout_chit_month;

ALTER TABLE payouts
    ADD COLUMN active_month INT GENERATED ALWAYS AS (
        CASE WHEN status NOT IN ('CANCELLED', 'VOIDED') THEN month_number ELSE NULL END
    ) VIRTUAL;

ALTER TABLE payouts
    ADD UNIQUE KEY uk_payout_chit_active_month (chit_id, active_month);
