-- Replace the simple UNIQUE(request_id) constraint with a generated-column
-- guard that is non-null only for active (PENDING or IN_FLIGHT) deliveries.
-- MySQL allows multiple NULL values in a unique index, so historical
-- SUPERSEDED/COMPLETED/FAILED rows do not block new PENDING rows for the
-- same request_id, enabling safe resend with history preserved.
ALTER TABLE setup_email_outbox
    DROP INDEX uq_setup_email_request,
    ADD COLUMN active_request_guard VARCHAR(36) GENERATED ALWAYS AS (
        CASE WHEN status IN ('PENDING','IN_FLIGHT') THEN request_id ELSE NULL END
    ) VIRTUAL,
    ADD UNIQUE INDEX uq_one_active_delivery_per_request (active_request_guard);
