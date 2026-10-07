-- BASIC is a permanently free plan. Earlier tenants received a 30-day default
-- expiry before BASIC became free, so normalize those existing rows as well as
-- future assignments handled by TenantService.
UPDATE tenants
SET plan_expires_at = '9999-12-31 23:59:59'
WHERE UPPER(plan) = 'BASIC'
  AND (plan_expires_at IS NULL OR plan_expires_at <> '9999-12-31 23:59:59');

