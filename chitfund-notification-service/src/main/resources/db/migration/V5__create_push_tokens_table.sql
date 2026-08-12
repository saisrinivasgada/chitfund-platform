-- Stores Expo push tokens for mobile devices.
-- One user can have multiple tokens (multiple devices / reinstalls).
-- Tokens are upserted on each app launch and deleted on logout.
CREATE TABLE user_push_tokens (
    id         VARCHAR(36)  NOT NULL PRIMARY KEY,
    user_id    VARCHAR(36)  NOT NULL,
    token      VARCHAR(255) NOT NULL,
    platform   VARCHAR(20)  NOT NULL COMMENT 'ios | android',
    created_at DATETIME     NOT NULL,
    updated_at DATETIME     NOT NULL,
    UNIQUE KEY uq_push_token (token),
    INDEX idx_push_user (user_id)
);
