-- Allows the refresh flow to regenerate a properly scoped access token (with tenantId claim).
-- Nullable because super-admin refresh tokens have no tenant scope.
ALTER TABLE refresh_tokens ADD COLUMN tenant_id VARCHAR(36) NULL;
