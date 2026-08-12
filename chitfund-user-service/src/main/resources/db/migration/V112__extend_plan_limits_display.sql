ALTER TABLE plan_limits
    ADD COLUMN display_name        VARCHAR(100)   NOT NULL DEFAULT '' AFTER plan,
    ADD COLUMN tagline             VARCHAR(200)   NULL AFTER display_name,
    ADD COLUMN features            TEXT           NULL COMMENT 'JSON array of feature strings' AFTER tagline,
    ADD COLUMN global_discount_pct DECIMAL(5,2)   NULL COMMENT '20.00 = 20% off displayed price' AFTER features,
    ADD COLUMN is_active           BOOLEAN        NOT NULL DEFAULT TRUE AFTER global_discount_pct,
    ADD COLUMN is_public           BOOLEAN        NOT NULL DEFAULT TRUE COMMENT 'show on registration/landing page' AFTER is_active,
    ADD COLUMN display_order       INT            NOT NULL DEFAULT 0 AFTER is_public,
    ADD COLUMN updated_at          DATETIME(6)    NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6);

UPDATE plan_limits SET
    display_name  = 'Starter',
    tagline       = 'Perfect to get started',
    features      = '["3 active chits","100 members","Payments & payouts","Email support"]',
    display_order = 1
WHERE plan = 'BASIC';

UPDATE plan_limits SET
    display_name  = 'Growth',
    tagline       = 'For growing businesses',
    features      = '["20 active chits","1,000 members","Advanced analytics","Priority support"]',
    display_order = 2
WHERE plan = 'PRO';

UPDATE plan_limits SET
    display_name  = 'Enterprise',
    tagline       = 'For large operations',
    features      = '["Unlimited chits & members","Custom integrations","Dedicated manager","99.9% uptime guarantee"]',
    display_order = 3
WHERE plan = 'ENTERPRISE';
