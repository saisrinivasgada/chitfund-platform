-- V19 added recorded_by as BINARY(16) and V20's MODIFY didn't change the type in MySQL.
-- Drop and re-add as VARCHAR(36) to match Hibernate's UUID mapping.
ALTER TABLE payment_batches DROP COLUMN recorded_by;
ALTER TABLE payment_batches ADD COLUMN recorded_by VARCHAR(36) NULL AFTER collected_by;
