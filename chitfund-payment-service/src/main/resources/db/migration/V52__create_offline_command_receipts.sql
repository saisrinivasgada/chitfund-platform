CREATE TABLE offline_command_receipts (
    id VARCHAR(36) NOT NULL PRIMARY KEY,
    tenant_id VARCHAR(36) NOT NULL,
    actor_id VARCHAR(36) NOT NULL,
    operation_id VARCHAR(128) NOT NULL,
    request_id VARCHAR(36) NOT NULL,
    action VARCHAR(32) NOT NULL,
    payload_hash VARCHAR(64) NOT NULL,
    grant_id VARCHAR(36) NOT NULL,
    response_json LONGTEXT NOT NULL,
    recorded_at DATETIME(6) NOT NULL,
    synchronized_at DATETIME(6) NOT NULL,
    CONSTRAINT uk_offline_command_owner_operation UNIQUE (tenant_id, actor_id, operation_id)
);
