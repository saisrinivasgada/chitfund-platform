-- Durable cross-service financial commands. Payout state and its command commit
-- together; a leased worker executes the command against payment-service until
-- it is acknowledged. This replaces best-effort HTTP calls that could silently
-- leave installment deductions or treasury entries inconsistent.
CREATE TABLE payout_financial_commands (
    id                  VARCHAR(36) NOT NULL,
    tenant_id           VARCHAR(36) NOT NULL,
    actor_id            VARCHAR(36) NOT NULL,
    payout_id           VARCHAR(36) NOT NULL,
    sequence_no         BIGINT NOT NULL,
    dedupe_key          VARCHAR(200) NOT NULL,
    command_type        VARCHAR(40) NOT NULL,
    chit_id             VARCHAR(36) NULL,
    member_id           VARCHAR(36) NULL,
    month_number        INT NULL,
    amount              DECIMAL(15,2) NULL,
    disbursement_mode   VARCHAR(20) NULL,
    status              VARCHAR(12) NOT NULL DEFAULT 'PENDING',
    attempts            INT NOT NULL DEFAULT 0,
    available_at        DATETIME(6) NOT NULL,
    claimed_until       DATETIME(6) NULL,
    claim_token         VARCHAR(36) NULL,
    last_error_code     VARCHAR(100) NULL,
    created_at          DATETIME(6) NOT NULL,
    completed_at        DATETIME(6) NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_pfc_dedupe (dedupe_key),
    UNIQUE KEY uq_pfc_payout_sequence (payout_id, sequence_no),
    INDEX idx_pfc_ready (status, available_at, claimed_until),
    INDEX idx_pfc_payout_status (payout_id, status, sequence_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
