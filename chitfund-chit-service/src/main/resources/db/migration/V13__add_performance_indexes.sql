-- chits: tenant-scoped list + status filter
CREATE INDEX idx_chits_tenant_status ON chits (tenant_id, status);
CREATE INDEX idx_chits_tenant_created ON chits (tenant_id, created_at);

-- month_reservations: chit + month number lookups
CREATE INDEX idx_mr_chit_month ON month_reservations (chit_id, month_number);
CREATE INDEX idx_mr_tenant_status ON month_reservations (tenant_id, status);
