-- Reporting projections are tenant-owned. An event without an explicit tenant
-- must fail instead of entering an unscoped empty-string bucket.
ALTER TABLE monthly_collection_snapshots ALTER COLUMN tenant_id DROP DEFAULT;
ALTER TABLE member_payment_summaries ALTER COLUMN tenant_id DROP DEFAULT;
ALTER TABLE payout_summaries ALTER COLUMN tenant_id DROP DEFAULT;
