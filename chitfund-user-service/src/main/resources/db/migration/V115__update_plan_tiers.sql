-- Add new capability columns to plan_limits
ALTER TABLE plan_limits
    ADD COLUMN max_staff           INT     NOT NULL DEFAULT 0   COMMENT 'max manager/staff accounts (0=none, -1=unlimited)',
    ADD COLUMN analytics_enabled   BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN priority_support    BOOLEAN NOT NULL DEFAULT FALSE;

-- Seed GROWTH plan (replaces old PRO)
INSERT INTO plan_limits
    (plan, display_name, tagline, features, max_active_chits, max_members, allowed_chit_types,
     price_monthly_inr, is_active, is_public, display_order, max_staff, analytics_enabled, priority_support)
VALUES
    ('GROWTH', 'Growth', 'For growing chit businesses',
     '["2 active chit groups","Up to 30 members","Automated reminders","Priority support","1 Manager + 1 Staff account","Cash pickup security"]',
     2, 30, 'STANDARD', 24900, TRUE, FALSE, 2, 2, FALSE, TRUE);

-- Migrate any tenants on old PRO plan to GROWTH
UPDATE tenants SET plan = 'GROWTH' WHERE plan = 'PRO';

-- Remove old PRO plan
DELETE FROM plan_limits WHERE plan = 'PRO';

-- Reset BASIC to correct pricing and limits
UPDATE plan_limits SET
    display_name       = 'Basic',
    tagline            = 'Perfect for small chit groups',
    features           = '["1 active chit group","Up to 20 members","Automated reminders","Basic dashboard"]',
    max_active_chits   = 1,
    max_members        = 20,
    allowed_chit_types = 'STANDARD',
    price_monthly_inr  = 14900,
    global_discount_pct = NULL,
    is_public          = FALSE,
    display_order      = 1,
    max_staff          = 0,
    analytics_enabled  = FALSE,
    priority_support   = FALSE
WHERE plan = 'BASIC';

-- Reset ENTERPRISE to correct pricing and limits
UPDATE plan_limits SET
    display_name       = 'Enterprise',
    tagline            = 'Maximum power for large operations',
    features           = '["3 active chit groups","Up to 50 members","Automated reminders","Priority support","3 Manager/Staff accounts","Cash pickup security","Full analytics"]',
    max_active_chits   = 3,
    max_members        = 50,
    allowed_chit_types = 'STANDARD',
    price_monthly_inr  = 39900,
    global_discount_pct = NULL,
    is_public          = FALSE,
    display_order      = 3,
    max_staff          = 3,
    analytics_enabled  = TRUE,
    priority_support   = TRUE
WHERE plan = 'ENTERPRISE';

-- Insert CUSTOM (contact-us tier)
INSERT INTO plan_limits
    (plan, display_name, tagline, features, max_active_chits, max_members, allowed_chit_types,
     price_monthly_inr, is_active, is_public, display_order, max_staff, analytics_enabled, priority_support)
VALUES
    ('CUSTOM', 'Custom', 'Tailored for large-scale operations',
     '["Unlimited chit groups","Unlimited members","Everything in Enterprise","Dedicated account manager","Custom pricing"]',
     -1, -1, 'STANDARD,POST_PAYOUT,FLEXI', 0, TRUE, FALSE, 4, -1, TRUE, TRUE);
