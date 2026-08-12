-- payouts: tenant-scoped list pages + status filtering
CREATE INDEX idx_payouts_tenant_status ON payouts (tenant_id, status);
CREATE INDEX idx_payouts_tenant_chit ON payouts (tenant_id, chit_id);
CREATE INDEX idx_payouts_tenant_member ON payouts (tenant_id, member_id);
