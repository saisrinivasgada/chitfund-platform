CREATE TABLE offline_payment_reviews (
    id VARCHAR(36) NOT NULL PRIMARY KEY,
    tenant_id VARCHAR(36) NOT NULL,
    actor_id VARCHAR(36) NOT NULL,
    operation_id VARCHAR(128) NOT NULL,
    payload_hash VARCHAR(64) NOT NULL,
    request_json LONGTEXT NOT NULL,
    cash_request_id VARCHAR(36),
    reason VARCHAR(40) NOT NULL,
    status VARCHAR(24) NOT NULL,
    submitted_at DATETIME(6) NOT NULL,
    resolved_at DATETIME(6),
    resolved_by VARCHAR(36),
    resolution_reason VARCHAR(500),
    receipt_id VARCHAR(36),
    CONSTRAINT uk_offline_review_operation UNIQUE (tenant_id, operation_id),
    INDEX idx_offline_reviews_pending (tenant_id, status, submitted_at)
);
