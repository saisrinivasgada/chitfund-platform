-- ============================================================
-- V13: Add settlement payment tracking columns and transaction table
--
-- WHY split payment tracking into a separate table?
-- A settlement is confirmed once (one-shot write), but the resulting
-- payment obligation may be fulfilled in multiple instalments over time.
-- Storing per-transaction detail in a child table keeps the settlements
-- row clean while giving full audit trail per payment event.
--
-- WHY the three new columns on settlements?
-- payment_status  → quick status check without aggregating transactions
-- collected_amount / disbursed_amount → cached running totals so the
--   "remaining balance" calculation is O(1) on every read
-- ============================================================

-- ── Step 1: Add payment tracking columns to settlements ──────────────────

ALTER TABLE settlements
    ADD COLUMN payment_status     VARCHAR(25)    NOT NULL DEFAULT 'PENDING'  AFTER net_amount,
    ADD COLUMN collected_amount   DECIMAL(15,2)  NOT NULL DEFAULT 0.00       AFTER payment_status,
    ADD COLUMN disbursed_amount   DECIMAL(15,2)  NOT NULL DEFAULT 0.00       AFTER collected_amount;

-- ── Step 2: Back-fill existing rows ──────────────────────────────────────
-- Existing settlements were fully processed under the old model (single wallet entry
-- on confirm). Mark them as complete so they don't appear in pending-payments lists.

UPDATE settlements SET payment_status = 'BALANCED'
    WHERE net_amount = 0;

UPDATE settlements SET payment_status = 'FULLY_COLLECTED',
                       collected_amount = net_amount
    WHERE net_amount > 0;

UPDATE settlements SET payment_status = 'FULLY_DISBURSED',
                       disbursed_amount = ABS(net_amount)
    WHERE net_amount < 0;

-- ── Step 3: Create the settlement_payment_transactions table ──────────────

CREATE TABLE settlement_payment_transactions (
    id                VARCHAR(36)     NOT NULL,
    settlement_id     VARCHAR(36)     NOT NULL,
    amount            DECIMAL(15,2)   NOT NULL,
    mode              VARCHAR(20)     NOT NULL,
    direction         VARCHAR(15)     NOT NULL,
    reference_number  VARCHAR(50)     NULL,
    notes             TEXT            NULL,
    recorded_by       VARCHAR(36)     NOT NULL,
    recorded_at       DATETIME(6)     NOT NULL,
    idempotency_key   VARCHAR(36)     NOT NULL,
    created_at        DATETIME(6)     NOT NULL,

    PRIMARY KEY (id),
    UNIQUE KEY uk_spt_idempotency (idempotency_key),
    INDEX idx_spt_settlement (settlement_id),

    CONSTRAINT fk_spt_settlement
        FOREIGN KEY (settlement_id) REFERENCES settlements (id)
        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
