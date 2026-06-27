-- WHY conditional: same idempotency guard as V15 — protects against partial runs.

SET @add_scheduled_for = (
    SELECT IF(COUNT(*) = 0,
        'ALTER TABLE cash_payment_requests ADD COLUMN scheduled_for DATETIME(6) NULL AFTER picked_up_by',
        'SELECT 1')
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'cash_payment_requests'
      AND COLUMN_NAME  = 'scheduled_for'
);
PREPARE stmt FROM @add_scheduled_for;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
