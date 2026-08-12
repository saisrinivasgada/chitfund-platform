-- Set a 30-day trial expiry for all existing tenants that have no expiry date yet
UPDATE tenants
SET plan_expires_at = DATE_ADD(NOW(), INTERVAL 30 DAY)
WHERE plan_expires_at IS NULL;
