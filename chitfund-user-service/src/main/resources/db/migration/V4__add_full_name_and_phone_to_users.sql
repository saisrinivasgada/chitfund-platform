ALTER TABLE users
    ADD COLUMN full_name VARCHAR(100) NULL AFTER email,
    ADD COLUMN phone     VARCHAR(15)  NULL AFTER full_name;
