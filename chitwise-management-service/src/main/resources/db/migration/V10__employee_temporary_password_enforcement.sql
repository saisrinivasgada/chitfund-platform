-- V9 was intentionally retired and must not be reused. This migration starts at V10.
-- Temporary passwords are stored only as BCrypt hashes in password_hash.
ALTER TABLE employees
    ADD COLUMN must_change_password TINYINT(1) NOT NULL DEFAULT 0,
    ADD COLUMN auth_version BIGINT NOT NULL DEFAULT 0;
