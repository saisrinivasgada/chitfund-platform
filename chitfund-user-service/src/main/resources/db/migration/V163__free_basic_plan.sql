-- BASIC plan is now permanently free and always visible on the public plan selection page.
-- Existing BASIC tenants keep their data; plan_expires_at is left untouched here —
-- the application sets it to 9999-12-31 on registration and on downgrade.
UPDATE plan_limits SET price_monthly_inr = 0, is_public = TRUE WHERE plan = 'BASIC';
