ALTER TABLE users
    ADD COLUMN deleted_at  DATETIME(6) NULL DEFAULT NULL,
    ADD COLUMN deleted_by  CHAR(36)    NULL DEFAULT NULL;

CREATE INDEX idx_users_deleted_at ON users (deleted_at);
