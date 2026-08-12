-- Promotions: standard promo codes + the global referral program
CREATE TABLE promotions (
    id                  VARCHAR(36)   NOT NULL,
    code                VARCHAR(50)   NOT NULL,
    label               VARCHAR(200)  NOT NULL,
    description         TEXT,
    promo_type          ENUM('STANDARD','REFERRAL') NOT NULL DEFAULT 'STANDARD',
    discount_pct        DECIMAL(5,2)  NOT NULL DEFAULT 0 COMMENT 'percentage off plan price for registrant',
    applies_to_plans    TEXT          NULL      COMMENT 'null = all plans; or comma-separated e.g. BASIC,GROWTH',
    referrer_credit_inr DECIMAL(10,2) NULL      COMMENT 'cash credit given to referrer tenant (REFERRAL type only)',
    valid_from          DATETIME(6)   NULL,
    valid_until         DATETIME(6)   NULL,
    max_uses            INT           NULL      COMMENT 'null = unlimited',
    uses_count          INT           NOT NULL DEFAULT 0,
    is_public           BOOLEAN       NOT NULL DEFAULT FALSE COMMENT 'show on landing / register page',
    is_active           BOOLEAN       NOT NULL DEFAULT TRUE,
    created_at          DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at          DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),

    PRIMARY KEY (id),
    UNIQUE KEY uq_promo_code (code),
    INDEX idx_promo_type (promo_type),
    INDEX idx_promo_public (is_public, is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tracks every referral.
-- Credits are PENDING at signup; credit_eligible_at is set when the referred org is activated.
-- A daily job releases PENDING credits once credit_eligible_at passes (30 days after activation).
CREATE TABLE referral_credits (
    id                  VARCHAR(36)   NOT NULL,
    referrer_tenant_id  VARCHAR(36)   NOT NULL,
    referred_tenant_id  VARCHAR(36)   NOT NULL,
    promo_id            VARCHAR(36)   NOT NULL,
    credit_inr          DECIMAL(10,2) NOT NULL,
    status              ENUM('PENDING','CREDITED','CANCELLED') NOT NULL DEFAULT 'PENDING',
    credit_eligible_at  DATETIME(6)   NULL COMMENT '30 days after referred org is activated; null until activation',
    credited_at         DATETIME(6)   NULL COMMENT 'when credit was released to referrer; null until status=CREDITED',
    created_at          DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    PRIMARY KEY (id),
    UNIQUE KEY uq_referral_referred (referred_tenant_id),
    INDEX idx_referral_referrer (referrer_tenant_id),
    INDEX idx_rc_status_eligible (status, credit_eligible_at),
    CONSTRAINT fk_rc_referrer FOREIGN KEY (referrer_tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_rc_referred FOREIGN KEY (referred_tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_rc_promo    FOREIGN KEY (promo_id)           REFERENCES promotions(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Extend tenants with referral & promo columns
ALTER TABLE tenants
    ADD COLUMN referral_code      VARCHAR(50)    NULL UNIQUE  COMMENT 'this tenant''s unique shareable referral code',
    ADD COLUMN applied_promo_id   VARCHAR(36)    NULL         COMMENT 'promo used at registration',
    ADD COLUMN credit_balance_inr DECIMAL(10,2)  NOT NULL DEFAULT 0 COMMENT 'accumulated referral credits';

-- Generate referral codes for existing tenants (slug-based, prefixed REF-)
UPDATE tenants SET referral_code = CONCAT('REF-', UPPER(REPLACE(slug, '-', '')))
WHERE referral_code IS NULL;

-- Seed the global referral program (inactive until super-admin turns it on)
INSERT INTO promotions (id, code, label, description, promo_type, discount_pct, referrer_credit_inr, is_public, is_active)
VALUES (
    UUID(),
    'REFERRAL-PROGRAM',
    'Referral Program',
    'Share your referral link. New orgs get a discount and you earn credit.',
    'REFERRAL',
    10.00,
    500.00,
    FALSE,
    FALSE
);
