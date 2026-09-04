CREATE TABLE email_reset_otps (
    id          VARCHAR(36)  PRIMARY KEY,
    user_id     VARCHAR(36)  NOT NULL,
    otp_hash    VARCHAR(64)  NOT NULL,
    attempts    INT          NOT NULL DEFAULT 0,
    expires_at  DATETIME     NOT NULL,
    used        TINYINT(1)   NOT NULL DEFAULT 0,
    created_at  DATETIME     NOT NULL,
    INDEX idx_ero_user    (user_id),
    INDEX idx_ero_created (user_id, created_at)
);
