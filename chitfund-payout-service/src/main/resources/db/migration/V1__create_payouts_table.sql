-- WHY a separate payout-service DB?
-- Winner announcement (chit-service) and money disbursement (payout-service) are
-- different events that may happen days apart. Keeping them separate lets the
-- admin manage the disbursement lifecycle independently — without touching the
-- winner selection logic.
--
-- winning_amount:   total installments collected for that month (before any discount)
-- discount_amount:  what the winner gives up — auction bid discount or 0 for lottery
-- net_payout_amount: winning_amount - discount_amount (what winner actually receives)
--
-- WHY UNIQUE KEY on (chit_id, month_number)?
-- A chit can only have one winner per month — enforces at DB level as a safety net.
--
-- reference_number: UTR for bank transfers, cheque number, UPI transaction ID, etc.
-- null when status is PENDING or payment mode is CASH.

CREATE TABLE payouts (
    id                  VARCHAR(36)    NOT NULL,
    chit_id             VARCHAR(36)    NOT NULL,
    member_id           VARCHAR(36)    NOT NULL,
    month_number        INT            NOT NULL,
    winning_amount      DECIMAL(15,2)  NOT NULL,
    discount_amount     DECIMAL(15,2)  NOT NULL DEFAULT 0.00,
    net_payout_amount   DECIMAL(15,2)  NOT NULL,
    status              VARCHAR(20)    NOT NULL DEFAULT 'PENDING',
    disbursement_mode   VARCHAR(20),
    reference_number    VARCHAR(50),
    notes               TEXT,
    created_by          VARCHAR(36)    NOT NULL,
    disbursed_at        DATETIME(6),
    disbursed_by        VARCHAR(36),
    cancelled_at        DATETIME(6),
    cancelled_by        VARCHAR(36),
    cancellation_reason TEXT,
    created_at          DATETIME(6)    NOT NULL,
    updated_at          DATETIME(6)    NOT NULL,

    PRIMARY KEY (id),
    UNIQUE KEY uk_payout_chit_month (chit_id, month_number),
    INDEX idx_payouts_member  (member_id),
    INDEX idx_payouts_chit    (chit_id),
    INDEX idx_payouts_status  (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
