-- Per-tenant capability overrides, parallel to plan_limits.capabilities.
-- When a tenant has a row in tenant_custom_limits, this column is the
-- authoritative capability list for that tenant (plan_limits is ignored).
ALTER TABLE tenant_custom_limits
  ADD COLUMN capabilities TEXT NULL AFTER priority_support;

-- Backfill from existing boolean columns so live custom tenants stay consistent.
UPDATE tenant_custom_limits SET capabilities =
  CASE
    WHEN analytics_enabled = 1 AND priority_support = 1
      THEN '["full_analytics","priority_support"]'
    WHEN analytics_enabled = 1
      THEN '["full_analytics"]'
    WHEN priority_support = 1
      THEN '["priority_support"]'
    ELSE '[]'
  END;
