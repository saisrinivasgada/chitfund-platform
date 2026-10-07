-- Refund retries are scoped to the original plan payment. Keeping the key and
-- canonical request on that locked row lets a timeout retry return the first
-- result without generating another receipt or changing the refund details.
ALTER TABLE plan_payments
    ADD COLUMN refund_idempotency_key VARCHAR(255) NULL AFTER request_fingerprint,
    ADD COLUMN refund_request_fingerprint VARCHAR(64) NULL AFTER refund_idempotency_key;
