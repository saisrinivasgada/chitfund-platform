# Admin wallet paise migration

V40 is the expand release only. It adds nullable `admin_wallet.amount_paise`;
new code writes both columns, but all calculations, reads, and APIs still use
the original `DECIMAL(12,2)` `amount` column.

## Release gates

1. Deploy V40 with `CHITWISE_ADMIN_WALLET_PAISE_REQUIRE_COMPLETE=false`.
2. Confirm every running payment-service instance is the dual-write version.
3. Backfill in small committed batches outside Flyway. Never run a single
   unbounded update over the ledger.
4. Reconcile until both queries remain zero while normal writes continue:

   ```sql
   SELECT COUNT(*) FROM admin_wallet WHERE amount_paise IS NULL;

   SELECT COUNT(*) FROM admin_wallet
   WHERE amount_paise IS NOT NULL
     AND amount_paise <> CAST(ROUND(amount * 100) AS SIGNED);
   ```

5. Set `CHITWISE_ADMIN_WALLET_PAISE_REQUIRE_COMPLETE=true`. Any old instance or
   divergent write now raises a critical metric alert.
6. Only in a later, separately approved release may reads flip to paise. Keep
   writing both columns through at least one full rollback window.

## Rollback

The expand release rolls back by deploying the previous application version.
The nullable column remains unused and decimal reads continue unchanged. If any
old version runs after backfill, backfill and reconcile again before attempting
a paise read flip.

Do not drop `amount`, make `amount_paise` non-null, or change the API contract in
this phase. Those are later contract steps and are not immediately reversible.
