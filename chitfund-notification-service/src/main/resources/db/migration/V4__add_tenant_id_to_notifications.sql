ALTER TABLE notifications
    ADD COLUMN tenant_id VARCHAR(36) NOT NULL
        DEFAULT '10000000-0000-0000-0000-000000000001'
        AFTER id;
CREATE INDEX idx_notifications_tenant ON notifications(tenant_id);

ALTER TABLE in_app_notifications
    ADD COLUMN tenant_id VARCHAR(36) NOT NULL
        DEFAULT '10000000-0000-0000-0000-000000000001'
        AFTER id;
CREATE INDEX idx_in_app_notifications_tenant ON in_app_notifications(tenant_id);
