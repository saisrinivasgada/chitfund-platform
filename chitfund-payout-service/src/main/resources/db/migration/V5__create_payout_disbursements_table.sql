-- Tracks each individual disbursement transaction for a payout.
-- Supports partial disbursements: a single payout can be paid out in multiple transactions.
CREATE TABLE payout_disbursements (
    id               VARCHAR(36)     NOT NULL PRIMARY KEY,
    payout_id        VARCHAR(36)     NOT NULL,
    amount           DECIMAL(15, 2)  NOT NULL,
    mode             VARCHAR(20)     NOT NULL,
    reference_number VARCHAR(50)     NULL,
    notes            TEXT            NULL,
    disbursed_by     VARCHAR(36)     NOT NULL,
    disbursed_at     DATETIME(6)     NOT NULL,
    INDEX idx_payout_disbursements_payout_id (payout_id)
);
