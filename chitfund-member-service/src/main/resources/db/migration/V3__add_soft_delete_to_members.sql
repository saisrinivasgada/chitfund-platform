-- Soft-delete support: records are never physically removed.
-- deleted_at: when the deletion happened; NULL means not deleted.
-- deleted_by: UUID of the admin who performed the deletion (audit trail).
ALTER TABLE members
    ADD COLUMN deleted_at  DATETIME(6) NULL DEFAULT NULL,
    ADD COLUMN deleted_by  CHAR(36)    NULL DEFAULT NULL;

CREATE INDEX idx_members_deleted_at ON members (deleted_at);
