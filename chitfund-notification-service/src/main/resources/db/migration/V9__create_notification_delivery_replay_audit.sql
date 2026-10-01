CREATE TABLE notification_delivery_replay_audit (
    id           VARCHAR(36)  NOT NULL,
    delivery_id  VARCHAR(36)  NOT NULL,
    event_id     VARCHAR(36)  NOT NULL,
    tenant_id    VARCHAR(36),
    replayed_by  VARCHAR(128) NOT NULL,
    reason       VARCHAR(500) NOT NULL,
    replayed_at  DATETIME(6)  NOT NULL,
    PRIMARY KEY (id),
    INDEX idx_notification_replay_delivery (delivery_id, replayed_at),
    CONSTRAINT fk_notification_replay_delivery
        FOREIGN KEY (delivery_id) REFERENCES notification_delivery_outbox(delivery_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
