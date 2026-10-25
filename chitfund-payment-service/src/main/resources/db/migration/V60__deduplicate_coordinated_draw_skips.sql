ALTER TABLE chit_month_draws
    ADD COLUMN skip_command_id VARCHAR(36) NULL,
    ADD COLUMN skip_request_hash VARCHAR(64) NULL;

CREATE TABLE draw_skip_command_receipts (
    tenant_id VARCHAR(50) NOT NULL,
    command_id VARCHAR(36) NOT NULL,
    chit_id VARCHAR(36) NOT NULL,
    request_hash VARCHAR(64) NOT NULL,
    status VARCHAR(12) NOT NULL,
    reason VARCHAR(100) NULL,
    created_at DATETIME(6) NOT NULL,
    PRIMARY KEY (tenant_id, command_id),
    INDEX idx_draw_skip_chit (tenant_id, chit_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
