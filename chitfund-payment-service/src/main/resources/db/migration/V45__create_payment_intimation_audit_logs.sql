CREATE TABLE payment_intimation_audit_logs (
    id                  VARCHAR(36)   NOT NULL,
    tenant_id           VARCHAR(36)   NOT NULL,
    intimation_id       VARCHAR(36)   NOT NULL,
    action              VARCHAR(50)   NOT NULL,
    from_status         VARCHAR(30)   NULL,
    to_status           VARCHAR(30)   NOT NULL,
    performed_by        VARCHAR(36)   NULL,
    performed_by_role   VARCHAR(30)   NULL,
    reason              TEXT          NULL,
    performed_at        DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    INDEX idx_intimation_audit_intimation (intimation_id),
    INDEX idx_intimation_audit_tenant     (tenant_id),
    INDEX idx_intimation_audit_time       (performed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
