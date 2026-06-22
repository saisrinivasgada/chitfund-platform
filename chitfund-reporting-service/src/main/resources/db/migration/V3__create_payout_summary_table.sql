-- Read model of payout-service's payouts table.
-- Pushed by payout-service on every status change (PENDING→DISBURSED, CANCELLED).
-- WHY store here? Reporting dashboard needs chit-level payout totals and per-winner
-- history without calling payout-service at query time.

CREATE TABLE payout_summaries (
    id                  VARCHAR(36)    NOT NULL,
    chit_id             VARCHAR(36)    NOT NULL,
    member_id           VARCHAR(36)    NOT NULL,
    member_name         VARCHAR(100),
    month_number        INT            NOT NULL,
    winning_amount      DECIMAL(15,2)  NOT NULL,
    discount_amount     DECIMAL(15,2)  NOT NULL DEFAULT 0.00,
    net_payout_amount   DECIMAL(15,2)  NOT NULL,
    status              VARCHAR(20)    NOT NULL,
    disbursement_mode   VARCHAR(20),
    disbursed_at        DATE,
    last_updated        DATETIME(6)    NOT NULL,

    PRIMARY KEY (id),
    UNIQUE KEY uk_payout_chit_month (chit_id, month_number),
    INDEX idx_ps_chit   (chit_id),
    INDEX idx_ps_member (member_id),
    INDEX idx_ps_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
