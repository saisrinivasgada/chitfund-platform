-- Settlement feature: tracks member exit settlements across all their chits.
--
-- WHY two tables?
-- 'settlements' is the top-level event: one row per "member is leaving the fund" action.
-- 'settlement_chit_items' holds the per-chit breakdown so we can audit exactly how
-- each chit's figure was computed (case type, mode, dues, future installments, etc.).
-- This is the classic header + line-items pattern used in invoicing and order systems.
--
-- WHY VARCHAR(36) for UUIDs instead of BINARY(16)?
-- Consistent with the rest of this service (see V2, V9).
-- Readability during debugging outweighs the small storage overhead.
--
-- WHY DECIMAL(15,2) for money?
-- Consistent with payment_records and admin_wallet.
-- Represents up to 9,999,999,999,999.99 — more than enough for chit fund amounts.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. settlements — one row per member exit settlement event
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE settlements (
    id              VARCHAR(36)     NOT NULL,
    member_id       VARCHAR(36)     NOT NULL,
    settled_by      VARCHAR(36)     NOT NULL,           -- admin/manager UUID who confirmed
    settled_at      DATETIME(6)     NOT NULL,
    total_owed      DECIMAL(15,2)   NOT NULL,           -- sum of positive chit items (member pays)
    total_refunded  DECIMAL(15,2)   NOT NULL,           -- sum of |negative| chit items (fund pays)
    net_amount      DECIMAL(15,2)   NOT NULL,           -- totalOwed - totalRefunded; negative = fund pays
    notes           TEXT            NULL,               -- optional admin notes
    created_at      DATETIME(6)     NOT NULL,

    PRIMARY KEY (id),
    INDEX idx_settlement_member    (member_id),
    INDEX idx_settlement_settled_at (settled_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. settlement_chit_items — one row per chit within a settlement
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE settlement_chit_items (
    id                      VARCHAR(36)     NOT NULL,
    settlement_id           VARCHAR(36)     NOT NULL,
    chit_id                 VARCHAR(36)     NOT NULL,
    chit_name               VARCHAR(200)    NOT NULL,   -- denormalized snapshot for audit
    settlement_case         VARCHAR(10)     NOT NULL,   -- CASE_A | CASE_B1 | CASE_B2 | CASE_C
    settlement_mode         VARCHAR(15)     NULL,       -- FAIR | ADMIN_WIN; only set for CASE_C
    payout_status           VARCHAR(30)     NULL,       -- snapshot: DISBURSED, PARTIALLY_DISBURSED, PENDING, NONE
    disbursed_amount        DECIMAL(15,2)   NULL,       -- what was actually paid out to the member
    net_payout_amount       DECIMAL(15,2)   NULL,       -- original agreed net payout (winning - discount)
    unpaid_dues             DECIMAL(15,2)   NOT NULL,   -- sum of (amountDue - amountPaid) for open records
    future_installments     DECIMAL(15,2)   NOT NULL,   -- future unbilled months × postPayoutRate
    payout_credit           DECIMAL(15,2)   NOT NULL,   -- CASE_C: stillOwedByFund | CASE_B1: reservedPayoutAmt | else 0
    total_paid              DECIMAL(15,2)   NULL,       -- CASE_B2 only: all amountPaid for this chit
    net_amount              DECIMAL(15,2)   NOT NULL,   -- final figure; positive = member pays, negative = fund refunds
    description             TEXT            NULL,       -- human-readable formula explanation

    PRIMARY KEY (id),
    INDEX idx_settlement_chit_item_settlement (settlement_id),
    INDEX idx_settlement_chit_item_chit       (chit_id),

    CONSTRAINT fk_sci_settlement
        FOREIGN KEY (settlement_id) REFERENCES settlements (id)
        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. payment_records — add SETTLEMENT_CLEARED to the status column
--
-- WHY ALTER rather than recreating the table?
-- payment_records already has data in production; we only extend the allowed set
-- of values. The Java enum is the source of truth; the DB column is VARCHAR(20)
-- (not a MySQL ENUM type), so no ALTER is actually needed for the new value to
-- be stored. This comment documents the intent for reviewers.
--
-- The status column in V2 was created as VARCHAR(20) NOT NULL DEFAULT 'OUTSTANDING'.
-- 'SETTLEMENT_CLEARED' is 19 characters — fits within VARCHAR(20).
-- No schema change required; this migration is a documentation-only no-op for status.
-- ─────────────────────────────────────────────────────────────────────────────

-- Verify the new status value fits: 'SETTLEMENT_CLEARED' = 19 chars ≤ VARCHAR(20). ✓
-- No DDL needed for the status column — kept here as an audit breadcrumb.
