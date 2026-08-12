-- members: tenant-scoped list + search by phone
CREATE INDEX idx_members_tenant_status ON members (tenant_id, status);
CREATE INDEX idx_members_tenant_phone ON members (tenant_id, phone);
