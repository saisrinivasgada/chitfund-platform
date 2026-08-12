CREATE TABLE plan_limits (
    plan                VARCHAR(20)   NOT NULL,
    max_active_chits    INT           NOT NULL COMMENT '-1 = unlimited',
    max_members         INT           NOT NULL COMMENT '-1 = unlimited',
    allowed_chit_types  VARCHAR(200)  NOT NULL COMMENT 'comma-separated: STANDARD,POST_PAYOUT',
    price_monthly_inr   BIGINT        NOT NULL COMMENT 'in paise (₹999 = 99900)',

    PRIMARY KEY (plan)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO plan_limits (plan, max_active_chits, max_members, allowed_chit_types, price_monthly_inr) VALUES
    ('BASIC',      3,   100,  'STANDARD',                     0),
    ('PRO',        20,  1000, 'STANDARD,POST_PAYOUT',         99900),
    ('ENTERPRISE', -1,  -1,   'STANDARD,POST_PAYOUT,FLEXI',   499900);

-- Add upgrade_request fields to tenants
ALTER TABLE tenants
    ADD COLUMN requested_plan VARCHAR(20)  NULL AFTER plan,
    ADD COLUMN upgrade_requested_at DATETIME(6) NULL AFTER requested_plan;
