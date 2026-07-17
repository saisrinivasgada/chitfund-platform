ALTER TABLE payment_batches
    ADD COLUMN idempotency_key VARCHAR(64) UNIQUE;
