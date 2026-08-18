-- capabilities JSON column is the single source of truth for plan enforcement.
-- The analytics_enabled and priority_support boolean columns are redundant.
ALTER TABLE plan_limits
  DROP COLUMN analytics_enabled,
  DROP COLUMN priority_support;

ALTER TABLE tenant_custom_limits
  DROP COLUMN analytics_enabled,
  DROP COLUMN priority_support;
