CREATE TABLE member_deactivation_command_outbox (
    delivery_id        VARCHAR(36)  NOT NULL,
    request_id         VARCHAR(36)  NOT NULL,
    tenant_id          VARCHAR(36)  NOT NULL,
    member_id          VARCHAR(36)  NOT NULL,
    user_id            VARCHAR(36)  NOT NULL,
    status             VARCHAR(20)  NOT NULL DEFAULT 'PENDING'
                           COMMENT 'PENDING | IN_FLIGHT | COMPLETED | FAILED',
    attempts           INT          NOT NULL DEFAULT 0,
    next_attempt_after DATETIME(6)  NOT NULL,
    lease_token        VARCHAR(36)           DEFAULT NULL,
    lease_expires_at   DATETIME(6)           DEFAULT NULL,
    last_error_type    VARCHAR(120)          DEFAULT NULL,
    last_error_msg     VARCHAR(2000)         DEFAULT NULL,
    created_at         DATETIME(6)  NOT NULL,
    PRIMARY KEY (delivery_id),
    UNIQUE KEY uq_deactivation_request (request_id),
    INDEX idx_deactivation_pending (status, next_attempt_after)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Outbox table for member-service deactivation commands issued on suspension';
