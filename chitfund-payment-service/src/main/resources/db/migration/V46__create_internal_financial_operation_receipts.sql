-- Consumer inbox for payout financial commands. The receipt and the financial
-- side effect share one transaction, giving retries at-least-once delivery with
-- exactly-once database effects for each command id.
CREATE TABLE internal_financial_operations (
    id              VARCHAR(36) NOT NULL,
    tenant_id       VARCHAR(36) NOT NULL,
    operation_type  VARCHAR(40) NOT NULL,
    request_hash    CHAR(64) NOT NULL,
    completed_at    DATETIME(6) NOT NULL,
    PRIMARY KEY (id),
    INDEX idx_ifo_tenant_completed (tenant_id, completed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
