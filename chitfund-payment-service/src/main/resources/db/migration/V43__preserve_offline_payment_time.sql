ALTER TABLE payment_batches
    ADD COLUMN recorded_at DATETIME(6) NULL AFTER recorded_by,
    ADD COLUMN synced_at DATETIME(6) NULL AFTER recorded_at;

UPDATE payment_batches
SET recorded_at = COALESCE(collected_at, created_at),
    synced_at = created_at
WHERE recorded_at IS NULL OR synced_at IS NULL;

ALTER TABLE payment_batches
    MODIFY recorded_at DATETIME(6) NOT NULL,
    MODIFY synced_at DATETIME(6) NOT NULL;
