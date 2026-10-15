-- Add-on naming becomes canonical from V181 onward.
-- V1-V180 are immutable history; their old identifiers are needed for upgrades.
-- Rename storage in place so existing plan selections and custom overrides survive.
-- Each step checks the old identifier to permit recovery after interrupted MySQL DDL.

SET @add_on_rename_sql = IF(
    EXISTS (SELECT 1 FROM information_schema.tables
            WHERE table_schema = DATABASE() AND table_name = 'plan_capability_defs'),
    'RENAME TABLE plan_capability_defs TO plan_add_on_defs',
    'SELECT 1'
);
PREPARE add_on_rename_statement FROM @add_on_rename_sql;
EXECUTE add_on_rename_statement;
DEALLOCATE PREPARE add_on_rename_statement;

SET @add_on_rename_sql = IF(
    EXISTS (SELECT 1 FROM information_schema.columns
            WHERE table_schema = DATABASE() AND table_name = 'plan_limits'
              AND column_name = 'capabilities'),
    'ALTER TABLE plan_limits RENAME COLUMN capabilities TO add_ons',
    'SELECT 1'
);
PREPARE add_on_rename_statement FROM @add_on_rename_sql;
EXECUTE add_on_rename_statement;
DEALLOCATE PREPARE add_on_rename_statement;

SET @add_on_rename_sql = IF(
    EXISTS (SELECT 1 FROM information_schema.columns
            WHERE table_schema = DATABASE() AND table_name = 'tenant_custom_limits'
              AND column_name = 'capabilities'),
    'ALTER TABLE tenant_custom_limits RENAME COLUMN capabilities TO add_ons',
    'SELECT 1'
);
PREPARE add_on_rename_statement FROM @add_on_rename_sql;
EXECUTE add_on_rename_statement;
DEALLOCATE PREPARE add_on_rename_statement;
