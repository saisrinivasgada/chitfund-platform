-- Supports member app login:
-- must_change_password: set to 1 when admin creates/resets the account, member must change on first login
-- last_login_at: updated on every successful login — lets admin see if the member is actively using the app

ALTER TABLE users
    ADD COLUMN must_change_password TINYINT(1) NOT NULL DEFAULT 0 AFTER locked,
    ADD COLUMN last_login_at DATETIME(6) NULL AFTER must_change_password;
