CREATE TABLE tenant_credit_adjustments (
    id                   VARCHAR(36) NOT NULL PRIMARY KEY,
    tenant_id            VARCHAR(36) NOT NULL,
    operation            VARCHAR(16) NOT NULL,
    amount_inr           DECIMAL(14,2) NOT NULL,
    reason               VARCHAR(500) NOT NULL,
    idempotency_key      VARCHAR(255) NOT NULL,
    request_fingerprint  VARCHAR(64) NOT NULL,
    balance_before_inr   DECIMAL(14,2) NOT NULL,
    balance_after_inr    DECIMAL(14,2) NOT NULL,
    actor_id             VARCHAR(36) NOT NULL,
    created_at           DATETIME(6) NOT NULL,
    UNIQUE KEY uq_tenant_credit_adjustment_key (idempotency_key),
    INDEX idx_credit_adjustment_tenant_created (tenant_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
