-- Do not infer legacy payout amounts from allocation totals: opening credit
-- was consumed without a per-record allocation. Unknown linked amounts remain
-- NULL and require reconciliation before reversal.
ALTER TABLE payment_records ADD COLUMN payout_deducted_amount DECIMAL(15,2) NULL;
