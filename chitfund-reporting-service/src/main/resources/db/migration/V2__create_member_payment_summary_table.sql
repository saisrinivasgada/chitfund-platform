-- Per-member, per-chit running summary. Updated on every payment event.
-- WHY a separate table from monthly_collection_snapshots?
-- monthly_collection_snapshots = chit-level view (how much did the whole group pay this month?)
-- member_payment_summaries    = member-level view (what is *this* member's position in the chit?)
-- These answer different dashboard questions and are updated independently.

CREATE TABLE member_payment_summaries (
    id                      VARCHAR(36)    NOT NULL,
    chit_id                 VARCHAR(36)    NOT NULL,
    member_id               VARCHAR(36)    NOT NULL,
    member_name             VARCHAR(100),
    member_phone            VARCHAR(15),

    total_due               DECIMAL(15,2)  NOT NULL DEFAULT 0.00,
    total_paid              DECIMAL(15,2)  NOT NULL DEFAULT 0.00,
    total_outstanding       DECIMAL(15,2)  NOT NULL DEFAULT 0.00,
    months_settled          INT            NOT NULL DEFAULT 0,
    months_partially_paid   INT            NOT NULL DEFAULT 0,
    months_outstanding      INT            NOT NULL DEFAULT 0,
    months_waived           INT            NOT NULL DEFAULT 0,

    last_payment_date       DATE,
    last_payment_amount     DECIMAL(15,2),
    last_updated            DATETIME(6)    NOT NULL,

    PRIMARY KEY (id),
    UNIQUE KEY uk_member_chit (member_id, chit_id),
    INDEX idx_mps_chit   (chit_id),
    INDEX idx_mps_member (member_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
