CREATE TABLE account_setup_tokens (
    id          VARCHAR(36)   NOT NULL,
    user_id     VARCHAR(36)   NOT NULL,
    token_hash  VARCHAR(64)   NOT NULL,
    expires_at  DATETIME(6)   NOT NULL,
    used_at     DATETIME(6)   NULL,
    created_at  DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    PRIMARY KEY (id),
    UNIQUE KEY uk_token_hash (token_hash),
    INDEX idx_ast_user_id (user_id),
    INDEX idx_ast_expires_at (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
