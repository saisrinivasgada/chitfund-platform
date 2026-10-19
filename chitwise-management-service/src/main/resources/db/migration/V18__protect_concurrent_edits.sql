-- Reject stale entity writes rather than silently losing another committed change.
ALTER TABLE employees ADD COLUMN version BIGINT NOT NULL DEFAULT 0;
ALTER TABLE support_tickets ADD COLUMN version BIGINT NOT NULL DEFAULT 0;
ALTER TABLE hub_custom_roles ADD COLUMN version BIGINT NOT NULL DEFAULT 0;
