-- Keep the exact old device payload separately from its review envelope.
-- A null payload identifies signed records created before this migration.
ALTER TABLE offline_staff_reviews
    ADD COLUMN legacy_payload_json LONGTEXT NULL,
    ADD COLUMN legacy_payload_hash VARCHAR(64) NULL;
