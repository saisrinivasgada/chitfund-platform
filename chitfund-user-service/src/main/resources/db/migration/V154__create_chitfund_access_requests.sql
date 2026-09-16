ALTER TABLE users
    ADD COLUMN email_verified_at DATETIME(6) NULL;

-- New setup links must be bound to one exact Chitfund Request.  The column is
-- nullable so historical setup tokens remain readable but cannot be used by
-- the new request flow.
ALTER TABLE account_setup_tokens
    ADD COLUMN chitfund_request_id CHAR(36) NULL,
    ADD KEY idx_account_setup_chitfund_request (chitfund_request_id);

-- One tenant member profile can belong to only one global member identity.
-- The existing user_id + tenant_id key separately allows the same global user
-- to have one profile in each of many organizations.
ALTER TABLE member_user_links
    ADD UNIQUE KEY uq_member_user_links_tenant_member (tenant_id, member_id);

CREATE TABLE chitfund_access_requests (
    id                    CHAR(36)     NOT NULL,
    tenant_id             CHAR(36)     NOT NULL,
    member_id             CHAR(36)     NOT NULL,
    requested_phone       VARCHAR(15)  NOT NULL,
    phone_country_code    VARCHAR(10)  NOT NULL DEFAULT '+91',
    requested_email       VARCHAR(255) NULL,
    candidate_user_id     CHAR(36)     NOT NULL,
    member_action_token_hash CHAR(64)  NULL,
    request_kind          VARCHAR(24)  NOT NULL,
    status                VARCHAR(24)  NOT NULL,
    requested_by          CHAR(36)     NULL,
    member_verified_at    DATETIME(6)  NULL,
    admin_confirmed_at    DATETIME(6)  NULL,
    admin_confirmed_by    CHAR(36)     NULL,
    expires_at            DATETIME(6)  NOT NULL,
    resend_count          INT          NOT NULL DEFAULT 0,
    last_sent_at          DATETIME(6)  NOT NULL,
    version               BIGINT       NOT NULL DEFAULT 0,
    created_at            DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at            DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    active_slot TINYINT GENERATED ALWAYS AS (
        CASE WHEN status IN ('PENDING_MEMBER','MEMBER_VERIFIED','AWAITING_ADMIN') THEN 1 ELSE NULL END
    ) STORED,
    PRIMARY KEY (id),
    UNIQUE KEY uq_chitfund_request_action_token (member_action_token_hash),
    UNIQUE KEY uq_chitfund_request_active (tenant_id, member_id, active_slot),
    KEY idx_chitfund_request_candidate (candidate_user_id, status),
    KEY idx_chitfund_request_tenant_member (tenant_id, member_id),
    KEY idx_chitfund_request_expiry (status, expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE account_email_otps (
    id                 CHAR(36)     NOT NULL,
    user_id            CHAR(36)     NOT NULL,
    email              VARCHAR(255) NOT NULL,
    verification_code  VARCHAR(10)  NOT NULL,
    purpose            VARCHAR(40)  NOT NULL,
    attempts           INT          NOT NULL DEFAULT 0,
    verified           BOOLEAN      NOT NULL DEFAULT FALSE,
    expires_at         DATETIME(6)  NOT NULL,
    created_at         DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    KEY idx_account_email_otp_lookup (user_id, email, purpose, verified, expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
