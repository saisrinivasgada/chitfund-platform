-- Manual UPI/bank/cheque recording can originate on more than one device.
-- The client operation id prevents retry duplicates; the external reference
-- prevents two independent operations from recording the same transfer.
ALTER TABLE payment_batches
    ADD COLUMN payment_reference VARCHAR(100) NULL AFTER notes,
    ADD UNIQUE KEY uk_payment_reference (tenant_id, payment_mode, payment_reference);
