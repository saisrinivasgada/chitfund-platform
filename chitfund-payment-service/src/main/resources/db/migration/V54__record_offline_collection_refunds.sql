ALTER TABLE offline_payment_reviews ADD COLUMN refund_json LONGTEXT;

-- Transaction-bound serialization shared by posting, recovery intake and refunds.
CREATE TABLE offline_payment_command_locks (
    tenant_id VARCHAR(36) NOT NULL,
    operation_key VARCHAR(128) NOT NULL,
    PRIMARY KEY (tenant_id, operation_key)
);
