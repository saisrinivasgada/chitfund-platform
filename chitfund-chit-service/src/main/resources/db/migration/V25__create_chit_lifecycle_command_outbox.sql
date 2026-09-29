-- Cross-service lifecycle work must survive process crashes and payment-service
-- outages. The command commits with the chit status and is delivered by a leased
-- worker outside the business transaction.
CREATE TABLE chit_lifecycle_commands (
    id              VARCHAR(36) NOT NULL,
    tenant_id       VARCHAR(36) NOT NULL,
    chit_id         VARCHAR(36) NOT NULL,
    command_type    VARCHAR(40) NOT NULL,
    dedupe_key      VARCHAR(100) NOT NULL,
    status          VARCHAR(12) NOT NULL DEFAULT 'PENDING',
    attempts        INT NOT NULL DEFAULT 0,
    available_at    DATETIME(6) NOT NULL,
    claimed_until   DATETIME(6) NULL,
    claim_token     VARCHAR(36) NULL,
    last_error_code VARCHAR(100) NULL,
    created_at      DATETIME(6) NOT NULL,
    completed_at    DATETIME(6) NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_chit_lifecycle_dedupe (tenant_id, dedupe_key),
    INDEX idx_chit_lifecycle_ready (status, available_at, claimed_until),
    INDEX idx_chit_lifecycle_chit (tenant_id, chit_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
