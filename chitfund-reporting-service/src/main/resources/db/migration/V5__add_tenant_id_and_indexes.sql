-- Add tenant_id to all reporting read-model tables

ALTER TABLE monthly_collection_snapshots
    ADD COLUMN tenant_id VARCHAR(36) NOT NULL DEFAULT '' AFTER id;

ALTER TABLE member_payment_summaries
    ADD COLUMN tenant_id VARCHAR(36) NOT NULL DEFAULT '' AFTER id;

ALTER TABLE payout_summaries
    ADD COLUMN tenant_id VARCHAR(36) NOT NULL DEFAULT '' AFTER id;

-- Composite indexes for tenant-scoped queries (replaces single-column chit/member indexes)
CREATE INDEX idx_mcs_tenant_chit ON monthly_collection_snapshots (tenant_id, chit_id);
CREATE INDEX idx_mps_tenant_chit ON member_payment_summaries (tenant_id, chit_id);
CREATE INDEX idx_mps_tenant_member ON member_payment_summaries (tenant_id, member_id);
CREATE INDEX idx_ps_tenant_chit ON payout_summaries (tenant_id, chit_id);
CREATE INDEX idx_ps_tenant_member ON payout_summaries (tenant_id, member_id);
