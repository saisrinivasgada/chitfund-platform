-- WHY a refresh_tokens table?
-- Refresh tokens must be server-side revocable. On logout, we mark the token revoked.
-- JWTs alone can't be revoked (stateless by design) — this table closes that gap.
-- Also enables "revoke all sessions" when account is locked or token theft is detected.

CREATE TABLE refresh_tokens (
    id          VARCHAR(36)  NOT NULL,
    token       VARCHAR(255) NOT NULL,
    user_id     VARCHAR(36)  NOT NULL,
    expires_at  DATETIME(6)  NOT NULL,
    revoked     TINYINT(1)   NOT NULL DEFAULT 0,
    created_at  DATETIME(6)  NOT NULL,

    PRIMARY KEY (id),
    UNIQUE KEY uk_refresh_tokens_token (token),
    CONSTRAINT fk_refresh_tokens_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Fast lookup on token value (happens on every /api/auth/refresh call)
CREATE INDEX idx_refresh_tokens_token   ON refresh_tokens(token);
-- Fast lookup to revoke all sessions for a user
CREATE INDEX idx_refresh_tokens_user_id ON refresh_tokens(user_id);
