-- Financial idempotency keys must be isolated by tenant and operation. The old
-- global indexes allowed one organization to collide with another organization's
-- request. Request hashes allow the service to reject reuse with different data.

ALTER TABLE payment_batches
    DROP INDEX idempotency_key,
    ADD COLUMN idempotency_operation VARCHAR(32) NULL AFTER idempotency_key,
    ADD COLUMN idempotency_request_hash CHAR(64) NULL AFTER idempotency_operation,
    ADD UNIQUE KEY uk_payment_batch_tenant_operation_idem
        (tenant_id, idempotency_operation, idempotency_key);

ALTER TABLE settlement_payment_transactions
    DROP INDEX uk_spt_idempotency,
    ADD COLUMN idempotency_request_hash CHAR(64) NULL AFTER idempotency_key,
    ADD UNIQUE KEY uk_spt_tenant_idempotency (tenant_id, idempotency_key);
