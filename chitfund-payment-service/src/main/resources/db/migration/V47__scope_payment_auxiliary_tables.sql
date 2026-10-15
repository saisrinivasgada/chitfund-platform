-- Tenant scope for auxiliary financial rows that were previously reachable only
-- through globally unique UUIDs. Service credentials and UUID entropy are not
-- substitutes for organization isolation.

DROP PROCEDURE IF EXISTS add_aux_tenant_column;
CREATE PROCEDURE add_aux_tenant_column(IN table_name_value VARCHAR(64))
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = table_name_value
          AND COLUMN_NAME = 'tenant_id'
    ) THEN
        SET @ddl = CONCAT('ALTER TABLE `', table_name_value,
                          '` ADD COLUMN tenant_id VARCHAR(36) NULL AFTER id');
        PREPARE stmt FROM @ddl;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;
    END IF;
END;

CALL add_aux_tenant_column('payment_allocations');
CALL add_aux_tenant_column('member_credit_balance');
CALL add_aux_tenant_column('member_credit_transactions');
CALL add_aux_tenant_column('cash_request_audit_logs');
DROP PROCEDURE add_aux_tenant_column;

UPDATE payment_allocations a
JOIN payment_batches b
  ON CAST(b.id AS BINARY(36)) = CAST(a.batch_id AS BINARY(36))
SET a.tenant_id = b.tenant_id
WHERE a.tenant_id IS NULL;

UPDATE cash_request_audit_logs l
JOIN cash_payment_requests r
  ON CAST(r.id AS BINARY(36)) = CAST(l.request_id AS BINARY(36))
SET l.tenant_id = r.tenant_id
WHERE l.tenant_id IS NULL;

UPDATE member_credit_balance c
JOIN (
    SELECT member_key, MIN(tenant_key) AS tenant_key
    FROM (
        SELECT CAST(member_id AS BINARY(36)) AS member_key,
               CAST(tenant_id AS BINARY(36)) AS tenant_key
        FROM payment_records WHERE tenant_id IS NOT NULL
        UNION ALL
        SELECT CAST(member_id AS BINARY(36)), CAST(tenant_id AS BINARY(36))
        FROM payment_batches WHERE tenant_id IS NOT NULL
        UNION ALL
        SELECT CAST(member_id AS BINARY(36)), CAST(tenant_id AS BINARY(36))
        FROM settlements WHERE tenant_id IS NOT NULL
    ) member_scopes
    GROUP BY member_key
    HAVING COUNT(DISTINCT tenant_key) = 1
) resolved ON CAST(c.member_id AS BINARY(36)) = resolved.member_key
SET c.tenant_id = CONVERT(resolved.tenant_key USING utf8mb4)
WHERE c.tenant_id IS NULL;

UPDATE member_credit_transactions t
JOIN member_credit_balance c
  ON CAST(c.member_id AS BINARY(36)) = CAST(t.member_id AS BINARY(36))
SET t.tenant_id = c.tenant_id
WHERE t.tenant_id IS NULL;

DROP PROCEDURE IF EXISTS assert_aux_tenant_backfill;
CREATE PROCEDURE assert_aux_tenant_backfill()
BEGIN
    IF EXISTS (SELECT 1 FROM payment_allocations WHERE tenant_id IS NULL)
       OR EXISTS (SELECT 1 FROM member_credit_balance WHERE tenant_id IS NULL)
       OR EXISTS (SELECT 1 FROM member_credit_transactions WHERE tenant_id IS NULL)
       OR EXISTS (SELECT 1 FROM cash_request_audit_logs WHERE tenant_id IS NULL) THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Cannot tenant-scope auxiliary financial rows; investigate unresolved historical ownership';
    END IF;
END;
CALL assert_aux_tenant_backfill();
DROP PROCEDURE assert_aux_tenant_backfill;

ALTER TABLE payment_allocations MODIFY tenant_id VARCHAR(36) NOT NULL;
ALTER TABLE member_credit_balance MODIFY tenant_id VARCHAR(36) NOT NULL;
ALTER TABLE member_credit_transactions MODIFY tenant_id VARCHAR(36) NOT NULL;
ALTER TABLE cash_request_audit_logs MODIFY tenant_id VARCHAR(36) NOT NULL;

DROP PROCEDURE IF EXISTS replace_credit_unique_index;
CREATE PROCEDURE replace_credit_unique_index()
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'member_credit_balance'
          AND INDEX_NAME = 'uq_credit_member'
    ) THEN
        ALTER TABLE member_credit_balance DROP INDEX uq_credit_member;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'member_credit_balance'
          AND INDEX_NAME = 'uq_credit_tenant_member'
    ) THEN
        ALTER TABLE member_credit_balance
            ADD UNIQUE KEY uq_credit_tenant_member (tenant_id, member_id);
    END IF;
END;
CALL replace_credit_unique_index();
DROP PROCEDURE replace_credit_unique_index;

DROP PROCEDURE IF EXISTS add_aux_index;
CREATE PROCEDURE add_aux_index(IN table_name_value VARCHAR(64), IN index_name_value VARCHAR(64),
                               IN columns_value VARCHAR(255))
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = table_name_value
          AND INDEX_NAME = index_name_value
    ) THEN
        SET @ddl = CONCAT('CREATE INDEX `', index_name_value, '` ON `', table_name_value,
                          '` (', columns_value, ')');
        PREPARE stmt FROM @ddl;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;
    END IF;
END;
CALL add_aux_index('payment_allocations', 'idx_alloc_tenant_batch', 'tenant_id, batch_id');
CALL add_aux_index('member_credit_transactions', 'idx_credit_txn_tenant_member',
                   'tenant_id, member_id, created_at');
CALL add_aux_index('cash_request_audit_logs', 'idx_cash_audit_tenant_request',
                   'tenant_id, request_id, performed_at');
DROP PROCEDURE add_aux_index;
