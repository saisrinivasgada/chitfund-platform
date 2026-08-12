-- Plain-text temp password visible to super-admin until admin sets their own password.
ALTER TABLE users ADD COLUMN temp_password VARCHAR(100) NULL DEFAULT NULL AFTER temp_password_hash;
