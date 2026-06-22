-- Track which payout caused a PAYOUT_DEDUCTED settlement so the reversal
-- endpoint can undo all deductions for a given payout across chits in one call.
ALTER TABLE payment_records ADD COLUMN settled_by_payout_id VARCHAR(36) NULL;
