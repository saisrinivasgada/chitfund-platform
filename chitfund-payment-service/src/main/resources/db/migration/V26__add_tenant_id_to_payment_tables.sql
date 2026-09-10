-- Adds tenant_id to the payment tables.
--
-- Made idempotent 2026-09-10. chit_month_draws already receives tenant_id in
-- V10, so on a database built from scratch this migration hit
-- "Duplicate column name 'tenant_id'", Flyway aborted, and payment-service
-- exited before logging was attached — a silent startup failure.
--
-- Production survived only because its schema grew incrementally and the deploy
-- runs `DELETE FROM flyway_schema_history WHERE success = 0`, which erases the
-- evidence each time. The practical effect was that the service could not be
-- rebuilt from source: a new environment, or a restore, would fail here.
--
-- Each column is now added only when absent, so this is safe on a fresh database
-- and a no-op on one that already has it. MySQL has no ADD COLUMN IF NOT EXISTS,
-- hence the information_schema guard.

DROP PROCEDURE IF EXISTS add_tenant_id_if_missing;

CREATE PROCEDURE add_tenant_id_if_missing(IN tbl VARCHAR(64), IN idx VARCHAR(64))
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = tbl
          AND COLUMN_NAME = 'tenant_id'
    ) THEN
        SET @ddl = CONCAT(
            'ALTER TABLE `', tbl, '` ',
            'ADD COLUMN tenant_id VARCHAR(36) NOT NULL ',
            "DEFAULT '10000000-0000-0000-0000-000000000001' AFTER id");
        PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;
    END IF;

    -- The index is separate: V10 adds the column to chit_month_draws but no
    -- index, so an existing database can have the column and still need this.
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = tbl
          AND INDEX_NAME = idx
    ) THEN
        SET @ddl = CONCAT('CREATE INDEX `', idx, '` ON `', tbl, '`(tenant_id)');
        PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;
    END IF;
END;

CALL add_tenant_id_if_missing('chit_month_draws',      'idx_draws_tenant');
CALL add_tenant_id_if_missing('payment_records',       'idx_payment_records_tenant');
CALL add_tenant_id_if_missing('payment_batches',       'idx_payment_batches_tenant');
CALL add_tenant_id_if_missing('cash_payment_requests', 'idx_cash_requests_tenant');
CALL add_tenant_id_if_missing('admin_wallet',          'idx_wallet_tenant');

DROP PROCEDURE add_tenant_id_if_missing;
