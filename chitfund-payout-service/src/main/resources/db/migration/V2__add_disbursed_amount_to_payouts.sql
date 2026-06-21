-- Add disbursed_amount to support partial disbursements.
-- Tracks how much has been handed over so far; status PARTIALLY_DISBURSED until fully paid.
ALTER TABLE payouts
    ADD COLUMN disbursed_amount DECIMAL(15,2) NOT NULL DEFAULT 0.00 AFTER net_payout_amount;
