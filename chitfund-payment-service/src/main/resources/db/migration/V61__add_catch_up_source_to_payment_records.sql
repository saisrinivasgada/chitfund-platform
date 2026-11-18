-- Tracks whether a payment_records row was created as a late-join catch-up
-- rather than at the normal draw-open time. NULL = normal record.
-- Value is a short provenance tag (e.g. 'LATE_JOIN').
ALTER TABLE payment_records
    ADD COLUMN catch_up_source VARCHAR(50) NULL;
