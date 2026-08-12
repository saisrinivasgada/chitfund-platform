-- payment_records: tenant + month scans (treasury page, payment list)
CREATE INDEX idx_pr_tenant_month ON payment_records (tenant_id, month_number);
CREATE INDEX idx_pr_tenant_status ON payment_records (tenant_id, status);
CREATE INDEX idx_pr_tenant_member ON payment_records (tenant_id, member_id);

-- payment_batches: pending-remittance endpoint + batch lookups
CREATE INDEX idx_pb_tenant_status ON payment_batches (tenant_id, status);
CREATE INDEX idx_pb_tenant_collected_at ON payment_batches (tenant_id, collected_at);

-- cash_payment_requests: staff task queue
CREATE INDEX idx_cpr_tenant_status ON cash_payment_requests (tenant_id, status);
CREATE INDEX idx_cpr_tenant_scheduled ON cash_payment_requests (tenant_id, scheduled_for);

-- admin_wallet: balance aggregation (tenant + account_type + entry_type)
CREATE INDEX idx_aw_tenant_account_entry ON admin_wallet (tenant_id, account_type, entry_type);
