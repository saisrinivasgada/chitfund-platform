-- Application-level immutability is not sufficient for financial and security evidence:
-- a future repository method or an accidental SQL statement could still rewrite history.
-- These guards make the append-only contract authoritative in MySQL as well.
-- The compound created-at index supports snapshot-stable pagination per tenant.
CREATE INDEX idx_audit_tenant_created ON audit_logs(tenant_id, created_at, id);

CREATE TRIGGER trg_audit_logs_reject_update
BEFORE UPDATE ON audit_logs
FOR EACH ROW
SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'audit_logs is append-only; updates are not permitted';

CREATE TRIGGER trg_audit_logs_reject_delete
BEFORE DELETE ON audit_logs
FOR EACH ROW
SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'audit_logs is append-only; deletes are not permitted';
