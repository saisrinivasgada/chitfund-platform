-- Reject stale entity writes rather than silently losing another committed change.
ALTER TABLE members ADD COLUMN version BIGINT NOT NULL DEFAULT 0;
