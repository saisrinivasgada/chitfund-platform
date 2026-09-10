-- Phase B: audited settlement correction through compensation + replacement.
--
-- V37 allowed only one non-VOIDED row per tenant/member. Phase B replaces
-- that emergency expression with the final supersession-aware live-row guard.
-- Historical VOIDED/SUPERSEDED rows have active_slot=NULL; one current row has 1.

ALTER TABLE settlements
    DROP INDEX uk_settlement_one_live_per_member,
    ADD COLUMN supersedes_id VARCHAR(36) NULL AFTER idempotency_request_hash,
    ADD COLUMN superseded_by_id VARCHAR(36) NULL AFTER supersedes_id,
    ADD COLUMN settlement_version INT NOT NULL DEFAULT 1 AFTER superseded_by_id,
    ADD COLUMN supersession_reason VARCHAR(500) NULL AFTER settlement_version,
    ADD COLUMN superseded_at DATETIME(6) NULL AFTER supersession_reason,
    ADD COLUMN superseded_by_actor VARCHAR(36) NULL AFTER superseded_at,
    ADD COLUMN reversal_completed_at DATETIME(6) NULL AFTER superseded_by_actor,
    ADD COLUMN reversal_ready BOOLEAN NOT NULL DEFAULT FALSE AFTER reversal_completed_at,
    MODIFY COLUMN active_slot TINYINT
        GENERATED ALWAYS AS (
            CASE
                WHEN superseded_by_id IS NULL AND payment_status <> 'VOIDED' THEN 1
                ELSE NULL
            END
        ) STORED,
    ADD UNIQUE KEY uk_settlement_one_live_per_member
        (tenant_id, member_id, active_slot),
    ADD INDEX idx_settlement_supersedes (supersedes_id),
    ADD INDEX idx_settlement_superseded_by (superseded_by_id);

-- Exact before-state for every PaymentRecord changed by confirmation. Existing
-- settlements cannot be safely backfilled because PARTIALLY_PAID and OUTSTANDING
-- are indistinguishable after both became SETTLEMENT_CLEARED.
CREATE TABLE settlement_payment_record_effects (
    id                 VARCHAR(36) NOT NULL,
    tenant_id          VARCHAR(36) NOT NULL,
    settlement_id      VARCHAR(36) NOT NULL,
    payment_record_id  VARCHAR(36) NOT NULL,
    before_status      VARCHAR(20) NOT NULL,
    after_status       VARCHAR(20) NOT NULL,
    before_amount_paid DECIMAL(15,2) NOT NULL,
    before_amount_due  DECIMAL(15,2) NOT NULL,
    reversed_at        DATETIME(6) NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_settlement_record_effect (settlement_id, payment_record_id),
    INDEX idx_srpe_record (payment_record_id),
    CONSTRAINT fk_srpe_settlement FOREIGN KEY (settlement_id)
        REFERENCES settlements (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Reversals are new immutable rows. The original transaction remains untouched.
ALTER TABLE settlement_payment_transactions
    ADD COLUMN reversal_of_id VARCHAR(36) NULL AFTER idempotency_request_hash,
    ADD UNIQUE KEY uq_spt_reversal_of (reversal_of_id);

ALTER TABLE admin_wallet
    ADD COLUMN reversal_of_entry_id VARCHAR(36) NULL AFTER reference_id,
    ADD UNIQUE KEY uq_wallet_reversal_of (reversal_of_entry_id),
    ADD INDEX idx_wallet_reference (tenant_id, reference_id);

ALTER TABLE member_credit_transactions
    ADD COLUMN source_settlement_id VARCHAR(36) NULL AFTER source_batch_id,
    ADD COLUMN reversal_of_id VARCHAR(36) NULL AFTER source_settlement_id,
    ADD UNIQUE KEY uq_credit_reversal_of (reversal_of_id),
    ADD INDEX idx_credit_settlement (source_settlement_id);

-- Immutable, payment-database audit facts. A later transactional outbox can
-- publish these without reconstructing history from mutable settlement rows.
CREATE TABLE settlement_audit_events (
    id                     VARCHAR(36) NOT NULL,
    tenant_id              VARCHAR(36) NOT NULL,
    event_type             VARCHAR(40) NOT NULL,
    settlement_id          VARCHAR(36) NOT NULL,
    related_settlement_id  VARCHAR(36) NULL,
    actor_id               VARCHAR(36) NOT NULL,
    reason                 VARCHAR(500) NULL,
    created_at             DATETIME(6) NOT NULL,
    PRIMARY KEY (id),
    INDEX idx_sae_settlement (tenant_id, settlement_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Observable cross-service saga. Payment data commits first; a retrying worker
-- then converges member-service to ACTIVE/INACTIVE without a network call inside
-- the financial transaction.
CREATE TABLE settlement_member_status_sync (
    id             VARCHAR(36) NOT NULL,
    tenant_id      VARCHAR(36) NOT NULL,
    settlement_id  VARCHAR(36) NOT NULL,
    member_id      VARCHAR(36) NOT NULL,
    desired_status VARCHAR(10) NOT NULL,
    status         VARCHAR(12) NOT NULL DEFAULT 'PENDING',
    attempts       INT NOT NULL DEFAULT 0,
    available_at   DATETIME(6) NOT NULL,
    claimed_until  DATETIME(6) NULL,
    claim_token    VARCHAR(36) NULL,
    last_error     VARCHAR(500) NULL,
    created_at     DATETIME(6) NOT NULL,
    completed_at   DATETIME(6) NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_sms_settlement_status (settlement_id, desired_status),
    INDEX idx_sms_pending (status, available_at, claimed_until),
    INDEX idx_sms_member_order (member_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
