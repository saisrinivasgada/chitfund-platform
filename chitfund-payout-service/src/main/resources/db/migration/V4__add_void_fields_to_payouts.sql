-- Support voiding a disbursement so the draw slot can be re-used.
-- VOIDED is distinct from CANCELLED: CANCELLED applies only to PENDING payouts,
-- VOIDED can apply to any status including DISBURSED.
ALTER TABLE payouts
    ADD COLUMN voided_at    DATETIME(6) NULL,
    ADD COLUMN voided_by    VARCHAR(36) NULL,
    ADD COLUMN void_reason  TEXT        NULL;
