-- Add plan_code to track whether limits are manually set or seeded from a plan
ALTER TABLE tenant_custom_limits ADD COLUMN plan_code VARCHAR(20) NOT NULL DEFAULT 'CUSTOM';

-- For existing rows (all manually set overrides), plan_code stays 'CUSTOM' — correct already.
-- Seed tenant_custom_limits for every tenant that doesn't have a row yet (uses their current plan's defaults).
INSERT INTO tenant_custom_limits (
    tenant_id, max_active_chits, max_members, max_staff,
    analytics_enabled, priority_support, allowed_chit_types,
    price_monthly_inr, plan_code, created_at, updated_at
)
SELECT
    t.id,
    pl.max_active_chits,
    pl.max_members,
    pl.max_staff,
    pl.analytics_enabled,
    pl.priority_support,
    pl.allowed_chit_types,
    pl.price_monthly_inr,
    COALESCE(t.plan, 'BASIC'),
    NOW(),
    NOW()
FROM tenants t
JOIN plan_limits pl ON pl.plan = COALESCE(t.plan, 'BASIC')
WHERE t.id NOT IN (SELECT tenant_id FROM tenant_custom_limits);
