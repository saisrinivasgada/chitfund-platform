-- V4 assigned a real customer tenant as the default for every future row. That
-- silently misattributes notifications whenever a producer omits organization
-- context. Keep existing values intact because they cannot be reconstructed
-- safely, but remove the default so new writes must state their scope.
ALTER TABLE notifications
    MODIFY COLUMN tenant_id VARCHAR(36) NULL DEFAULT NULL;

ALTER TABLE in_app_notifications
    MODIFY COLUMN tenant_id VARCHAR(36) NULL DEFAULT NULL;

CREATE INDEX idx_notifications_tenant_recipient_created
    ON notifications (tenant_id, recipient_id, created_at);

CREATE INDEX idx_in_app_tenant_recipient_created
    ON in_app_notifications (tenant_id, recipient_id, created_at);

CREATE INDEX idx_in_app_tenant_recipient_read
    ON in_app_notifications (tenant_id, recipient_id, is_read);
