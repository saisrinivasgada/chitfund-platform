-- Calendar months may contain multiple payout slots. Versions protect edits to
-- each individual row without reinstating the old one-slot-per-month constraint.
ALTER TABLE month_reservations ADD COLUMN version BIGINT NOT NULL DEFAULT 0;
