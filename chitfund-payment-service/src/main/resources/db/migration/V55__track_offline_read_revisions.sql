-- A per-tenant revision changes in the same transaction as every source edit.
CREATE TABLE offline_read_revisions (
    tenant_id VARCHAR(36) NOT NULL PRIMARY KEY,
    revision BIGINT NOT NULL DEFAULT 0
);
INSERT INTO offline_read_revisions(tenant_id, revision) SELECT DISTINCT tenant_id, 1 FROM payment_batches;
CREATE TRIGGER offline_payment_batches_insert AFTER INSERT ON payment_batches
FOR EACH ROW INSERT INTO offline_read_revisions(tenant_id, revision) VALUES (NEW.tenant_id, 1)
ON DUPLICATE KEY UPDATE revision = revision + 1;
CREATE TRIGGER offline_payment_batches_update AFTER UPDATE ON payment_batches
FOR EACH ROW INSERT INTO offline_read_revisions(tenant_id, revision) VALUES (NEW.tenant_id, 1)
ON DUPLICATE KEY UPDATE revision = revision + 1;
CREATE TRIGGER offline_payment_batches_delete AFTER DELETE ON payment_batches
FOR EACH ROW INSERT INTO offline_read_revisions(tenant_id, revision) VALUES (OLD.tenant_id, 1)
ON DUPLICATE KEY UPDATE revision = revision + 1;
