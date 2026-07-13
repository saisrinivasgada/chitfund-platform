-- Stores per-draw breakdown of installment settlement as "month:amount" pairs
-- e.g. "3:5000" (one draw) or "2:5000,3:4500" (multiple draws, sorted by month)
ALTER TABLE payouts ADD COLUMN installment_settlement_months TEXT;
