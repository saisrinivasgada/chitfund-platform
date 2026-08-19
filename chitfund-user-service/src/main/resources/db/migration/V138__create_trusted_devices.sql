CREATE TABLE trusted_devices (
    id          CHAR(36)     NOT NULL,
    user_id     CHAR(36)     NOT NULL,
    token_hash  VARCHAR(64)  NOT NULL,
    expires_at  DATETIME     NOT NULL,
    created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_trusted_devices_user_id   (user_id),
    UNIQUE KEY uk_trusted_devices_token_hash (token_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
