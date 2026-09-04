-- Team notes were originally created without tenant ownership. Add explicit
-- tenant scope so all new reads and writes can enforce organization isolation.
--
-- Existing rows cannot be backfilled safely from this service's database because
-- author accounts live in user-service. They intentionally remain NULL and are
-- quarantined: the application only queries notes using a non-null tenant_id.
-- Operators may backfill verified rows later using an audited cross-service export.
ALTER TABLE team_notes
    ADD COLUMN tenant_id VARCHAR(36) NULL AFTER id;

CREATE INDEX idx_team_notes_tenant_created
    ON team_notes (tenant_id, created_at);

CREATE INDEX idx_team_notes_tenant_author
    ON team_notes (tenant_id, author_id);
