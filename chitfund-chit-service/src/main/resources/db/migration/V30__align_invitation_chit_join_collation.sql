-- V1 explicitly uses unicode_ci; invitation tables inherited the server default.
-- Normalize the join column without changing invitation keys or foreign keys.
ALTER TABLE chit_invitations MODIFY COLUMN chit_id
    VARCHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL;
