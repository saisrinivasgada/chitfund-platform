CREATE TABLE tenant_custom_limits (
    tenant_id           VARCHAR(36)   NOT NULL,
    max_active_chits    INT           NOT NULL COMMENT '-1 = unlimited',
    max_members         INT           NOT NULL COMMENT '-1 = unlimited',
    allowed_chit_types  VARCHAR(200)  NOT NULL COMMENT 'comma-separated: STANDARD,POST_PAYOUT,RESERVATION,FLEXI',
    price_monthly_inr   BIGINT        NOT NULL DEFAULT 0 COMMENT 'in paise',
    notes               TEXT          NULL     COMMENT 'internal super-admin notes on why custom limits were granted',
    created_at          DATETIME(6)   NOT NULL,
    updated_at          DATETIME(6)   NOT NULL,

    PRIMARY KEY (tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
