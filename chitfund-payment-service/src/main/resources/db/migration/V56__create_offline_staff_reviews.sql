CREATE TABLE offline_staff_reviews (
    id VARCHAR(36) NOT NULL PRIMARY KEY,
    tenant_id VARCHAR(36) NOT NULL,
    actor_id VARCHAR(36) NOT NULL,
    actor_role VARCHAR(16) NOT NULL,
    operation_id VARCHAR(128) NOT NULL,
    request_id VARCHAR(36) NOT NULL,
    payload_hash VARCHAR(64) NOT NULL,
    request_json LONGTEXT NOT NULL,
    status VARCHAR(24) NOT NULL,
    submitted_at DATETIME(6) NOT NULL,
    resolved_at DATETIME(6),
    resolved_by VARCHAR(36),
    resolution_reason VARCHAR(500),
    resolution_json LONGTEXT,
    CONSTRAINT uk_offline_staff_review UNIQUE (tenant_id, actor_id, operation_id),
    INDEX idx_offline_staff_pending (tenant_id, status, submitted_at)
);
