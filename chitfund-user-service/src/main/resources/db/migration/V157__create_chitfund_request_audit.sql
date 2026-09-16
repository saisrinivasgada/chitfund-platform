CREATE TABLE chitfund_request_audit (
    id             CHAR(36)     NOT NULL,
    request_id     CHAR(36)     NOT NULL,
    action         VARCHAR(48)  NOT NULL,
    from_status    VARCHAR(24)  NULL,
    to_status      VARCHAR(24)  NULL,
    actor_id       CHAR(36)     NULL,
    actor_type     VARCHAR(24)  NOT NULL,
    details        VARCHAR(500) NULL,
    created_at     DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    KEY idx_chitfund_request_audit (request_id, created_at),
    CONSTRAINT fk_chitfund_request_audit_request
        FOREIGN KEY (request_id) REFERENCES chitfund_access_requests(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
