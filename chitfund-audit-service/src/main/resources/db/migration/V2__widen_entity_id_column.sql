-- entity_id needs to hold composite keys like "<uuid>-<monthNumber>"
-- e.g. "550e8400-e29b-41d4-a716-446655440001-12" = 39 chars
ALTER TABLE audit_logs MODIFY COLUMN entity_id VARCHAR(100) NOT NULL;
