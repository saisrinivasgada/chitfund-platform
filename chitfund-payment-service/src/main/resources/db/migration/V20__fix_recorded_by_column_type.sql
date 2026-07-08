-- V19 added recorded_by as BINARY(16) but Hibernate maps UUIDs as VARCHAR(36) in this project.
-- Convert the column to the correct type.
ALTER TABLE payment_batches MODIFY COLUMN recorded_by VARCHAR(36) NULL;
