CREATE TABLE plan_payments (
    id                    CHAR(36)     NOT NULL PRIMARY KEY,
    tenant_id             CHAR(36)     NOT NULL,
    type                  ENUM('PURCHASE','RENEWAL','UPGRADE','REFUND') NOT NULL,
    status                ENUM('COMPLETED','REFUNDED') NOT NULL DEFAULT 'COMPLETED',

    amount_paise          BIGINT       NOT NULL,

    to_plan               VARCHAR(20)  NOT NULL,
    to_plan_name          VARCHAR(100) NOT NULL,
    from_plan             VARCHAR(20),
    from_plan_name        VARCHAR(100),

    -- proration fields (only for UPGRADE)
    proration_credit_paise BIGINT,
    full_plan_price_paise  BIGINT,
    days_remaining         INT,
    days_in_period         INT,

    -- period covered by this payment
    plan_period_start     DATE         NOT NULL,
    plan_period_end       DATE         NOT NULL,

    payment_method        ENUM('UPI','CASH','BANK_TRANSFER') NOT NULL,
    payment_reference     VARCHAR(255),
    payment_date          DATE         NOT NULL,

    -- refund details (populated when a refund is recorded against this payment)
    refund_amount_paise   BIGINT,
    refund_reason         TEXT,
    refund_method         ENUM('UPI','CASH','BANK_TRANSFER'),
    refund_reference      VARCHAR(255),
    refunded_at           TIMESTAMP    NULL,
    refunded_by           CHAR(36),

    notes                 TEXT,
    idempotency_key       VARCHAR(255),
    created_by            CHAR(36)     NOT NULL,
    created_at            TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at            TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    UNIQUE KEY uq_plan_payment_idempotency (idempotency_key),
    INDEX idx_pp_tenant    (tenant_id),
    INDEX idx_pp_date      (payment_date DESC)
);

CREATE TABLE plan_receipts (
    id             CHAR(36)    NOT NULL PRIMARY KEY,
    receipt_number VARCHAR(50) NOT NULL,
    payment_id     CHAR(36)    NOT NULL,
    tenant_id      CHAR(36)    NOT NULL,
    type           ENUM('PAYMENT','REFUND') NOT NULL,
    amount_paise   BIGINT      NOT NULL,
    issued_at      TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,

    UNIQUE KEY uq_receipt_number (receipt_number),
    INDEX idx_receipt_tenant (tenant_id),
    CONSTRAINT fk_receipt_payment FOREIGN KEY (payment_id) REFERENCES plan_payments (id)
);

-- Auto-increment table to generate globally unique sequential receipt numbers
CREATE TABLE receipt_number_seq (
    id         BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
    created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);
