-- Preserve the canonical request behind an idempotency key so a retry can
-- return the original payment while rejecting reuse for different input.
ALTER TABLE plan_payments
    ADD COLUMN request_fingerprint VARCHAR(64) NULL AFTER idempotency_key;
