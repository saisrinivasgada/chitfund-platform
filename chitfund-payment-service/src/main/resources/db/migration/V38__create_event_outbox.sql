-- Durable producer-side event delivery. One row is written per destination in
-- the same transaction as the payment/draw/cash-request state change.
CREATE TABLE event_outbox (
    id               VARCHAR(36)  NOT NULL,
    tenant_id        VARCHAR(36)  NOT NULL,
    aggregate_type   VARCHAR(64)  NOT NULL,
    aggregate_id     VARCHAR(64)  NOT NULL,
    event_type       VARCHAR(64)  NOT NULL,
    destination      VARCHAR(128) NOT NULL,
    payload          JSON         NOT NULL,
    status           VARCHAR(16)  NOT NULL DEFAULT 'PENDING',
    attempts         INT          NOT NULL DEFAULT 0,
    next_attempt_at  DATETIME(6)  NOT NULL,
    last_error       TEXT         NULL,
    created_at       DATETIME(6)  NOT NULL,
    published_at     DATETIME(6)  NULL,
    PRIMARY KEY (id),
    INDEX idx_event_outbox_claim (status, next_attempt_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
