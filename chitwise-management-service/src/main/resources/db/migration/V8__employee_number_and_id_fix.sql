-- Expand id column to hold full UUIDs (was VARCHAR(20), too small for 36-char UUIDs)
ALTER TABLE employees MODIFY COLUMN id VARCHAR(36) NOT NULL;

-- Sequential employee number for ID cards (CW-0001, CW-0002, ...)
-- MySQL auto-assigns sequential values to existing rows when adding AUTO_INCREMENT UNIQUE
ALTER TABLE employees ADD COLUMN employee_number BIGINT AUTO_INCREMENT UNIQUE;
