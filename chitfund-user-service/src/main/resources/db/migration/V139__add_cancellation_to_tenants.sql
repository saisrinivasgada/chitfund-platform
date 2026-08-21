ALTER TABLE tenants
    ADD COLUMN cancellation_requested_at  DATETIME     NULL,
    ADD COLUMN cancellation_requested_by  VARCHAR(36)  NULL;
