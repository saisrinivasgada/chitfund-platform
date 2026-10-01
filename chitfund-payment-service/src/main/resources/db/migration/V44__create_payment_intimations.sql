CREATE TABLE payment_intimations (
    id          VARCHAR(36)  NOT NULL PRIMARY KEY,
    tenant_id   VARCHAR(36)  NOT NULL,
    member_id   VARCHAR(36)  NOT NULL,
    status      VARCHAR(20)  NOT NULL DEFAULT 'PENDING',
    notes       TEXT         NULL,
    reject_reason TEXT        NULL,
    void_reason   TEXT        NULL,
    submitted_by  VARCHAR(36) NULL,
    approved_by   VARCHAR(36) NULL,
    rejected_by   VARCHAR(36) NULL,
    voided_by     VARCHAR(36) NULL,
    approved_at   DATETIME(6) NULL,
    rejected_at   DATETIME(6) NULL,
    voided_at     DATETIME(6) NULL,
    created_at    DATETIME(6) NOT NULL,
    updated_at    DATETIME(6) NOT NULL,
    INDEX idx_intimations_tenant_status (tenant_id, status),
    INDEX idx_intimations_member        (tenant_id, member_id)
);

CREATE TABLE payment_intimation_items (
    id              VARCHAR(36)     NOT NULL PRIMARY KEY,
    intimation_id   VARCHAR(36)     NOT NULL,
    chit_id         VARCHAR(36)     NOT NULL,
    claimed_amount  DECIMAL(15,2)   NOT NULL,
    approved_amount DECIMAL(15,2)   NULL,
    payment_batch_id VARCHAR(36)    NULL,
    CONSTRAINT fk_intimation_items_intimation
        FOREIGN KEY (intimation_id) REFERENCES payment_intimations (id),
    INDEX idx_intimation_items_intimation (intimation_id)
);
