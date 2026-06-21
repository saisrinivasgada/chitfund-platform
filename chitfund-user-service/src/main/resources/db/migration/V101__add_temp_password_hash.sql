-- Stores an optional temp password alongside the real one.
-- When set, the user may log in with either; using the real password clears this field.
ALTER TABLE users ADD COLUMN temp_password_hash VARCHAR(255) NULL DEFAULT NULL;
