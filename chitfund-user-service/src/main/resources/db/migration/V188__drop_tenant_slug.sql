-- Slug was only used for *.thechitwise.com subdomain routing which has been removed.
-- Make nullable (preserve existing org data, stop requiring it for new registrations).
ALTER TABLE tenants MODIFY COLUMN slug VARCHAR(50) NULL;
ALTER TABLE tenants DROP INDEX uk_tenant_slug;
