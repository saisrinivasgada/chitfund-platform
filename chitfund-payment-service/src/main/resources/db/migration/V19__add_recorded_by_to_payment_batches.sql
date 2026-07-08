-- Track which admin recorded a direct (UPI / BANK_TRANSFER / admin-self CASH) payment.
-- collectedBy only holds the worker UUID for worker-collected cash; for everything else it was null.
ALTER TABLE payment_batches ADD COLUMN recorded_by VARCHAR(36) NULL AFTER collected_by;
