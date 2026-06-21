-- V7: Overhaul month_reservations to support the full Reservation Schedule.
--
-- Key changes:
--   1. Drop unique constraint (chit_id, month_number) — one month can have MULTIPLE
--      payout slots (e.g. Jan 2027 pays both ABC and XYZ).
--   2. Drop @Version column — no longer needed (INSERTs not contested UPDATEs).
--   3. Add reservation_month (actual LocalDate) — source of truth; month_number kept for legacy.
--   4. Make member_id nullable — UNALLOCATED months have no winner yet.
--   5. Add payout_amount, post_payout_contribution, status, void fields, full audit.

-- Step 1: drop old unique index and version column
ALTER TABLE month_reservations
    DROP INDEX uk_chit_month_reservation,
    DROP COLUMN version;

-- Step 2: make member_id nullable (unallocated slots)
ALTER TABLE month_reservations
    MODIFY COLUMN member_id VARCHAR(36) NULL;

-- Step 3: add new columns
ALTER TABLE month_reservations
    ADD COLUMN reservation_month        DATE            NULL        AFTER month_number,
    ADD COLUMN payout_amount            DECIMAL(15,2)   NULL        AFTER reservation_month,
    ADD COLUMN post_payout_contribution DECIMAL(15,2)   NULL        AFTER payout_amount,
    ADD COLUMN status                   VARCHAR(20)     NOT NULL DEFAULT 'RESERVED' AFTER post_payout_contribution,
    ADD COLUMN void_reason              TEXT            NULL,
    ADD COLUMN voided_at                DATETIME(6)     NULL,
    ADD COLUMN voided_by                VARCHAR(36)     NULL,
    ADD COLUMN created_by               VARCHAR(36)     NULL,
    ADD COLUMN updated_at               DATETIME(6)     NULL,
    ADD COLUMN updated_by               VARCHAR(36)     NULL,
    ADD INDEX idx_reservations_chit_month   (chit_id, reservation_month),
    ADD INDEX idx_reservations_member       (chit_id, member_id),
    ADD INDEX idx_reservations_status       (status);

-- Step 4: back-fill reservation_month from month_number + chit start_date
UPDATE month_reservations mr
JOIN chits c ON mr.chit_id = c.id
SET mr.reservation_month = DATE_ADD(c.start_date, INTERVAL (mr.month_number - 1) MONTH)
WHERE c.start_date IS NOT NULL
  AND mr.month_number IS NOT NULL
  AND mr.reservation_month IS NULL;

-- Step 5: set status UNALLOCATED for rows where member_id is now NULL
UPDATE month_reservations
SET status = 'UNALLOCATED'
WHERE member_id IS NULL AND status = 'RESERVED';
