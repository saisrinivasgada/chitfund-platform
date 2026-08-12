-- Add discount duration model to promotions
ALTER TABLE promotions
    ADD COLUMN discount_duration_type  ENUM('ONCE','MONTHS','FOREVER') NOT NULL DEFAULT 'FOREVER'
        COMMENT 'ONCE=next billing only, MONTHS=N months, FOREVER=never expires',
    ADD COLUMN discount_duration_months INT NULL
        COMMENT 'only used when discount_duration_type=MONTHS';

-- Track when a tenant''s promotional discount expires (null = forever)
ALTER TABLE tenants
    ADD COLUMN promo_discount_until DATETIME(6) NULL
        COMMENT 'computed at activation from promo duration; null means FOREVER';
