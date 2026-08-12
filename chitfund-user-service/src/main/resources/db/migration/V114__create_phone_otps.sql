CREATE TABLE phone_otps (
    id              VARCHAR(36)     NOT NULL,
    phone           VARCHAR(20)     NOT NULL,
    country_code    VARCHAR(10)     NOT NULL DEFAULT '+91',
    otp_hash        VARCHAR(100)    NOT NULL COMMENT 'SHA-256 of the 6-digit OTP',
    purpose         VARCHAR(30)     NOT NULL COMMENT 'REGISTRATION or PHONE_CHANGE',
    user_id         VARCHAR(36)     NULL     COMMENT 'set for PHONE_CHANGE',
    expires_at      DATETIME(6)     NOT NULL,
    attempts        INT             NOT NULL DEFAULT 0,
    verified        BOOLEAN         NOT NULL DEFAULT FALSE,
    created_at      DATETIME(6)     NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    INDEX idx_phone_purpose (phone, purpose, expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
