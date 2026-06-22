-- Add void tracking fields to payment_batches.
-- voidReason, voidedAt, voidedBy allow admins to void a collected batch before remittance.
-- Uses information_schema guards so the migration is idempotent (safe to re-run if columns exist).

SET @db = DATABASE();

SET @void_reason_missing = (
    SELECT COUNT(*) = 0 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'payment_batches' AND COLUMN_NAME = 'void_reason');
SET @sql = IF(@void_reason_missing, 'ALTER TABLE payment_batches ADD COLUMN void_reason TEXT NULL AFTER notes', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @voided_at_missing = (
    SELECT COUNT(*) = 0 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'payment_batches' AND COLUMN_NAME = 'voided_at');
SET @sql = IF(@voided_at_missing, 'ALTER TABLE payment_batches ADD COLUMN voided_at DATETIME(6) NULL AFTER void_reason', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @voided_by_missing = (
    SELECT COUNT(*) = 0 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'payment_batches' AND COLUMN_NAME = 'voided_by');
SET @sql = IF(@voided_by_missing, 'ALTER TABLE payment_batches ADD COLUMN voided_by VARCHAR(36) NULL AFTER voided_at', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
