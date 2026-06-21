-- Staff accounts (WORKER, MANAGER) may not have an email address.
-- Email is still unique when present — NULL values are excluded from UNIQUE indexes in MySQL.
ALTER TABLE users MODIFY COLUMN email VARCHAR(255) NULL;
