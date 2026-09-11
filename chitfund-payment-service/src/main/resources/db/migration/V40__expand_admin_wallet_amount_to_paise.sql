-- Expand phase only: older application instances continue writing `amount`,
-- while the new version dual-writes this nullable shadow column. Do not
-- backfill or flip reads in this migration; each phase must remain reversible.
ALTER TABLE admin_wallet
    ADD COLUMN amount_paise BIGINT NULL AFTER amount,
    ADD CONSTRAINT chk_admin_wallet_amount_paise_nonnegative
        CHECK (amount_paise IS NULL OR amount_paise >= 0);
