ALTER TABLE audit_logs
    ADD COLUMN correlation_id VARCHAR(100) NULL AFTER metadata,
    ADD COLUMN idempotency_key VARCHAR(100) NULL AFTER correlation_id,
    ADD COLUMN source VARCHAR(30) NOT NULL DEFAULT 'UNKNOWN' AFTER idempotency_key,
    ADD COLUMN outcome VARCHAR(20) NOT NULL DEFAULT 'SUCCESS' AFTER source,
    ADD COLUMN reason VARCHAR(500) NULL AFTER outcome,
    ADD COLUMN effective_actor_id VARCHAR(36) NULL AFTER reason,
    ADD COLUMN effective_actor_role VARCHAR(30) NULL AFTER effective_actor_id,
    ADD COLUMN device_session_hash VARCHAR(128) NULL AFTER effective_actor_role,
    ADD COLUMN occurred_at DATETIME(6) NULL AFTER device_session_hash,
    ADD COLUMN original_offline_at DATETIME(6) NULL AFTER occurred_at,
    ADD COLUMN synchronized_at DATETIME(6) NULL AFTER original_offline_at;

UPDATE audit_logs SET occurred_at = created_at WHERE occurred_at IS NULL;

ALTER TABLE audit_logs
    MODIFY COLUMN occurred_at DATETIME(6) NOT NULL;

CREATE INDEX idx_audit_tenant_occurred ON audit_logs(tenant_id, occurred_at, id);
CREATE INDEX idx_audit_tenant_outcome ON audit_logs(tenant_id, outcome, occurred_at);
CREATE INDEX idx_audit_correlation ON audit_logs(correlation_id);
CREATE INDEX idx_audit_idempotency ON audit_logs(tenant_id, idempotency_key);
