-- Track when and which version of Terms of Service each org/user accepted
ALTER TABLE tenants
    ADD COLUMN terms_accepted_at  DATETIME     NULL,
    ADD COLUMN terms_version      VARCHAR(20)  NULL;

ALTER TABLE users
    ADD COLUMN terms_accepted_at  DATETIME     NULL,
    ADD COLUMN terms_version      VARCHAR(20)  NULL;
