-- Historical notification rows cannot be safely attributed to an organization
-- because the original schema stored neither tenant nor a durable tenant link.
-- Keep them for forensic retention but make them invisible to tenant-scoped reads.
-- Every application write after this migration supplies tenant_id.
ALTER TABLE notifications
    ADD COLUMN tenant_id VARCHAR(36) NULL AFTER id;

CREATE INDEX idx_notifications_tenant_recipient_created
    ON notifications (tenant_id, recipient_user_id, created_at);

CREATE INDEX idx_notifications_tenant_role_created
    ON notifications (tenant_id, recipient_role, created_at);
