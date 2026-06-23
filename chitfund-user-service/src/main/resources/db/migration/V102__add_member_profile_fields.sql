-- Extend users table with member-facing profile fields.
-- All guards are idempotent so re-running this migration is safe.
SET @db = DATABASE();

SET @c = (SELECT COUNT(*) = 0 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'users' AND COLUMN_NAME = 'phone_country_code');
SET @sql = IF(@c, 'ALTER TABLE users ADD COLUMN phone_country_code VARCHAR(10) NULL AFTER phone', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @c = (SELECT COUNT(*) = 0 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'users' AND COLUMN_NAME = 'city');
SET @sql = IF(@c, 'ALTER TABLE users ADD COLUMN city VARCHAR(100) NULL AFTER phone_country_code', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @c = (SELECT COUNT(*) = 0 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'users' AND COLUMN_NAME = 'address');
SET @sql = IF(@c, 'ALTER TABLE users ADD COLUMN address VARCHAR(500) NULL AFTER city', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @c = (SELECT COUNT(*) = 0 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'users' AND COLUMN_NAME = 'aadhaar_last4');
SET @sql = IF(@c, 'ALTER TABLE users ADD COLUMN aadhaar_last4 CHAR(4) NULL AFTER address', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @c = (SELECT COUNT(*) = 0 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'users' AND COLUMN_NAME = 'pan_number');
SET @sql = IF(@c, 'ALTER TABLE users ADD COLUMN pan_number VARCHAR(10) NULL AFTER aadhaar_last4', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @c = (SELECT COUNT(*) = 0 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'users' AND COLUMN_NAME = 'notes');
SET @sql = IF(@c, 'ALTER TABLE users ADD COLUMN notes TEXT NULL AFTER pan_number', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @c = (SELECT COUNT(*) = 0 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'users' AND COLUMN_NAME = 'referred_by_id');
SET @sql = IF(@c, 'ALTER TABLE users ADD COLUMN referred_by_id CHAR(36) NULL AFTER notes', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
