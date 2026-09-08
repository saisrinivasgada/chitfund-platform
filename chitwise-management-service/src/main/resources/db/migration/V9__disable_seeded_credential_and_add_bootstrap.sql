-- V9: Disable the known-compromised seeded account and add bootstrap infrastructure.

UPDATE employees
SET
    password_hash   = '*COMPROMISED-CREDENTIAL-DISABLED-BY-V9-MIGRATION*',
    is_active       = 0,
    updated_at      = NOW()
WHERE id = 'EMP-001'
  AND password_hash = '$2b$12$gU9KnFzFGGZ8Y9DSRlRuleNIv4cPCDt5oQM4nTHjPVtnRHZw7bpMm';

CREATE TABLE IF NOT EXISTS bootstrap_config (
    id                  CHAR(36)     NOT NULL DEFAULT (UUID()),
    state               ENUM('PENDING','TOKEN_SENT','COMPLETE') NOT NULL DEFAULT 'PENDING',
    target_email        VARCHAR(255) NOT NULL,
    setup_token_hmac    VARCHAR(64)          ,
    token_expires_at    DATETIME             ,
    token_used_at       DATETIME             ,
    initiated_by_host   VARCHAR(255)         ,
    initiated_at        DATETIME     NOT NULL DEFAULT NOW(),
    completed_at        DATETIME             ,
    created_at          DATETIME     NOT NULL DEFAULT NOW(),
    updated_at          DATETIME     NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_bootstrap_state ON bootstrap_config(state);
