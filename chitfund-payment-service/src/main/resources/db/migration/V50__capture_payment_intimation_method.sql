ALTER TABLE payment_intimations
    ADD COLUMN payment_mode VARCHAR(20) NULL AFTER status,
    ADD COLUMN payment_reference VARCHAR(100) NULL AFTER payment_mode;

