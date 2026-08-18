-- Stores the set of enabled capability keys per plan as a JSON array.
-- e.g. '["full_analytics","digital_payments"]'
-- This is the enforcement source of truth; analytics_enabled / priority_support
-- are kept in sync for backward compatibility with existing code.
ALTER TABLE plan_limits
  ADD COLUMN capabilities TEXT NULL AFTER features;

-- Backfill from the existing boolean columns so live plans stay consistent.
UPDATE plan_limits SET capabilities =
  CASE
    WHEN analytics_enabled = 1 AND priority_support = 1
      THEN '["full_analytics","priority_support"]'
    WHEN analytics_enabled = 1
      THEN '["full_analytics"]'
    WHEN priority_support = 1
      THEN '["priority_support"]'
    ELSE '[]'
  END;
