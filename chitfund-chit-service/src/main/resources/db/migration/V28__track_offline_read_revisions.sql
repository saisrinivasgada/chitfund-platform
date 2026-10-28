-- A per-tenant revision changes in the same transaction as every source edit.
CREATE TABLE offline_read_revisions (
    tenant_id VARCHAR(36) NOT NULL PRIMARY KEY,
    revision BIGINT NOT NULL DEFAULT 0
);
INSERT INTO offline_read_revisions(tenant_id, revision) SELECT DISTINCT tenant_id, 1 FROM chits;
CREATE TRIGGER offline_chits_insert AFTER INSERT ON chits
FOR EACH ROW INSERT INTO offline_read_revisions(tenant_id, revision) VALUES (NEW.tenant_id, 1)
ON DUPLICATE KEY UPDATE revision = revision + 1;
CREATE TRIGGER offline_chits_update AFTER UPDATE ON chits
FOR EACH ROW INSERT INTO offline_read_revisions(tenant_id, revision) VALUES (NEW.tenant_id, 1)
ON DUPLICATE KEY UPDATE revision = revision + 1;
CREATE TRIGGER offline_chits_delete AFTER DELETE ON chits
FOR EACH ROW INSERT INTO offline_read_revisions(tenant_id, revision) VALUES (OLD.tenant_id, 1)
ON DUPLICATE KEY UPDATE revision = revision + 1;
CREATE TRIGGER offline_enrollments_insert AFTER INSERT ON chit_enrollments
FOR EACH ROW INSERT INTO offline_read_revisions(tenant_id, revision)
SELECT tenant_id, 1 FROM chits WHERE id=NEW.chit_id
ON DUPLICATE KEY UPDATE revision = revision + 1;
CREATE TRIGGER offline_enrollments_update AFTER UPDATE ON chit_enrollments
FOR EACH ROW INSERT INTO offline_read_revisions(tenant_id, revision)
SELECT tenant_id, 1 FROM chits WHERE id=NEW.chit_id
ON DUPLICATE KEY UPDATE revision = revision + 1;
CREATE TRIGGER offline_enrollments_delete AFTER DELETE ON chit_enrollments
FOR EACH ROW INSERT INTO offline_read_revisions(tenant_id, revision)
SELECT tenant_id, 1 FROM chits WHERE id=OLD.chit_id
ON DUPLICATE KEY UPDATE revision = revision + 1;
