ALTER TABLE audit_logs
    ADD COLUMN tenant_id VARCHAR(36) NOT NULL
        DEFAULT '10000000-0000-0000-0000-000000000001'
        AFTER id;
CREATE INDEX idx_audit_logs_tenant ON audit_logs(tenant_id);
