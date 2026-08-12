-- Add voided_at and voided_by to settlements table.
-- Also extend payment_status column to accommodate the new VOIDED value (varchar(25) is already long enough).

ALTER TABLE settlements
    ADD COLUMN voided_at DATETIME NULL AFTER disbursed_amount,
    ADD COLUMN voided_by VARCHAR(36) NULL AFTER voided_at;
