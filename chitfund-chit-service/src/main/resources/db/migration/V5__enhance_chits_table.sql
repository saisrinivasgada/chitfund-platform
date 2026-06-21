-- V5: Enhance chits table for Reservation Chit, audit, pause/resume, soft-delete, and dynamic attributes.
--
-- WHY chit_type column?
-- Enables future Lottery/Auction types without schema changes; routing logic uses this flag.
--
-- WHY JSON attributes column?
-- Sparse optional metadata avoids EAV join overhead. MySQL 5.7+ validates JSON on insert.
--
-- WHY soft-delete (deleted_at / deleted_by) instead of DELETE?
-- Financial records must be auditable. Physically deleting a chit destroys payment history.
-- All list queries filter WHERE deleted_at IS NULL.

ALTER TABLE chits
    -- Type
    ADD COLUMN chit_type            VARCHAR(20)     NOT NULL DEFAULT 'RESERVATION'
                                    AFTER description,
    -- Chit face value (total monthly pool); installment = chit_value / total_members
    ADD COLUMN chit_value           DECIMAL(15,2)   NULL
                                    AFTER chit_type,
    -- Installment due day (1–28)
    ADD COLUMN monthly_due_date     INT             NULL
                                    AFTER end_date,
    -- Contribution rule
    ADD COLUMN post_payout_contribution_enabled   TINYINT(1) NOT NULL DEFAULT 0
                                    AFTER monthly_due_date,
    ADD COLUMN default_post_payout_contribution   DECIMAL(15,2) NULL
                                    AFTER post_payout_contribution_enabled,
    -- Admin-held spots count (informational)
    ADD COLUMN admin_held_spots_count INT           NOT NULL DEFAULT 0
                                    AFTER default_post_payout_contribution,
    -- Pause / resume
    ADD COLUMN paused_at            DATETIME(6)     NULL,
    ADD COLUMN paused_by            VARCHAR(36)     NULL,
    ADD COLUMN total_paused_months  INT             NOT NULL DEFAULT 0,
    -- Soft delete
    ADD COLUMN deleted_at           DATETIME(6)     NULL,
    ADD COLUMN deleted_by           VARCHAR(36)     NULL,
    -- Audit: who last updated
    ADD COLUMN updated_by           VARCHAR(36)     NULL,
    -- Dynamic attributes as JSON
    ADD COLUMN attributes           JSON            NULL,
    -- New statuses: PAUSED and DELETED (column is VARCHAR so no ALTER needed)
    ADD INDEX idx_chits_chit_type   (chit_type),
    ADD INDEX idx_chits_deleted_at  (deleted_at);

-- Back-fill chit_value from total_amount for existing rows
UPDATE chits SET chit_value = total_amount WHERE chit_value IS NULL;

-- Make chit_value non-nullable after backfill
ALTER TABLE chits MODIFY COLUMN chit_value DECIMAL(15,2) NOT NULL;
