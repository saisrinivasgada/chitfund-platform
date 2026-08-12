ALTER TABLE tenant_custom_limits
    ADD COLUMN max_staff           INT            NOT NULL DEFAULT 0   AFTER max_members,
    ADD COLUMN analytics_enabled   TINYINT(1)     NOT NULL DEFAULT 0   AFTER max_staff,
    ADD COLUMN priority_support    TINYINT(1)     NOT NULL DEFAULT 0   AFTER analytics_enabled;
