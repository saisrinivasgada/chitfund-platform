-- Settlement breakdown columns: track the individual components of discountAmount
-- installmentSettlement  = current month installment collected during disbursement
-- crossChitSettlement    = dues collected from member's other chits during disbursement
-- manualAdjustment       = any additional admin-entered deduction (e.g. commission)
-- invariant: installmentSettlement + crossChitSettlement + manualAdjustment = discountAmount
ALTER TABLE payouts
    ADD COLUMN installment_settlement DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    ADD COLUMN cross_chit_settlement  DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    ADD COLUMN manual_adjustment      DECIMAL(15,2) NOT NULL DEFAULT 0.00;
