-- Add void tracking fields to payment_batches.
-- voidReason, voidedAt, voidedBy allow admins to void a collected batch before remittance.
ALTER TABLE payment_batches
    ADD COLUMN void_reason  TEXT        NULL AFTER notes,
    ADD COLUMN voided_at    DATETIME(6) NULL AFTER void_reason,
    ADD COLUMN voided_by    VARCHAR(36) NULL AFTER voided_at;
