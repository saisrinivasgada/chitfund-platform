CREATE TABLE event_outbox (
    delivery_id VARCHAR(36) NOT NULL,
    event_id VARCHAR(36) NOT NULL,
    tenant_id VARCHAR(36) NOT NULL,
    aggregate_type VARCHAR(64) NOT NULL,
    aggregate_id VARCHAR(64) NOT NULL,
    event_type VARCHAR(64) NOT NULL,
    destination VARCHAR(128) NOT NULL,
    payload JSON NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    attempts INT NOT NULL DEFAULT 0,
    available_at DATETIME(6) NOT NULL,
    lease_token VARCHAR(36) NULL,
    claimed_until DATETIME(6) NULL,
    last_error_code VARCHAR(100) NULL,
    last_error VARCHAR(2000) NULL,
    created_at DATETIME(6) NOT NULL,
    published_at DATETIME(6) NULL,
    PRIMARY KEY (delivery_id),
    UNIQUE KEY uq_outbox_event_destination (event_id, destination),
    INDEX idx_outbox_pending (status, available_at, delivery_id),
    INDEX idx_outbox_expired_lease (status, claimed_until, delivery_id),
    INDEX idx_outbox_event (event_id),
    INDEX idx_outbox_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE event_outbox_replay_audit (
    id VARCHAR(36) NOT NULL,
    delivery_id VARCHAR(36) NOT NULL,
    tenant_id VARCHAR(36) NOT NULL,
    replayed_by VARCHAR(36) NOT NULL,
    reason VARCHAR(500) NOT NULL,
    replayed_at DATETIME(6) NOT NULL,
    PRIMARY KEY (id),
    INDEX idx_outbox_replay_delivery (delivery_id, replayed_at),
    CONSTRAINT fk_outbox_replay_delivery FOREIGN KEY (delivery_id)
        REFERENCES event_outbox (delivery_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
