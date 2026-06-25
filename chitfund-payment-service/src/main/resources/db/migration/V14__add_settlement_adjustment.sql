-- Add admin adjustment fields to settlements table.
-- adjustment_amount: positive = extra charge to member, negative = discount/waiver.
-- Applied on top of the calculated net amount before the settlement is confirmed.
ALTER TABLE settlements
    ADD COLUMN adjustment_amount DECIMAL(15, 2) NOT NULL DEFAULT 0.00 AFTER disbursed_amount,
    ADD COLUMN adjustment_reason TEXT            NULL                  AFTER adjustment_amount;
