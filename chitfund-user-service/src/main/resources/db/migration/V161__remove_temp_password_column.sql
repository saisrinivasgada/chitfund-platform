-- Phase 1.2: Remove plaintext temp_password column from users table.
-- Passwords are now hashed (temp_password_hash) and the plaintext is returned once on creation, never stored.
ALTER TABLE users DROP COLUMN IF EXISTS temp_password;
