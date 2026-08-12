ALTER TABLE plan_payments
    ADD COLUMN account_credit_applied_paise BIGINT NOT NULL DEFAULT 0 COMMENT 'Tenant account credit applied to reduce the gross amount',
    ADD COLUMN gross_amount_paise           BIGINT NOT NULL DEFAULT 0 COMMENT 'Plan price before credit deduction';
