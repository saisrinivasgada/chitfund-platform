-- A payout creation can be retried by a browser, mobile client, proxy, or gateway.
-- Reserve the tenant-scoped key in the same transaction as the payout so the
-- first request either commits both records or neither. Concurrent requests use
-- the row lock acquired by INSERT ... ON DUPLICATE KEY UPDATE.
CREATE TABLE payout_creation_idempotency (
    tenant_id       VARCHAR(36) NOT NULL,
    idempotency_key VARCHAR(64) NOT NULL,
    request_hash    CHAR(64) NOT NULL,
    payout_id       VARCHAR(36) NULL,
    created_at      DATETIME(6) NOT NULL,
    PRIMARY KEY (tenant_id, idempotency_key),
    UNIQUE KEY uq_payout_creation_result (tenant_id, payout_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
