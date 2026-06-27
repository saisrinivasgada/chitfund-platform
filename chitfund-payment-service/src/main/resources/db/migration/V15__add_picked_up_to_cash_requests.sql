-- WHY conditional: if a previous deploy partially ran this migration and crashed before
-- Flyway could record success, the next run would fail with "Duplicate column name".
-- Using information_schema check makes this idempotent.

SET @add_picked_up_at = (
    SELECT IF(COUNT(*) = 0,
        'ALTER TABLE cash_payment_requests ADD COLUMN picked_up_at DATETIME(6) NULL AFTER assigned_by',
        'SELECT 1')
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'cash_payment_requests'
      AND COLUMN_NAME  = 'picked_up_at'
);
PREPARE stmt FROM @add_picked_up_at;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @add_picked_up_by = (
    SELECT IF(COUNT(*) = 0,
        'ALTER TABLE cash_payment_requests ADD COLUMN picked_up_by VARCHAR(36) NULL AFTER picked_up_at',
        'SELECT 1')
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'cash_payment_requests'
      AND COLUMN_NAME  = 'picked_up_by'
);
PREPARE stmt FROM @add_picked_up_by;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
