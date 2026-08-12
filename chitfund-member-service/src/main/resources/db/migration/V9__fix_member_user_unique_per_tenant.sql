-- A person (user_id) can be a member in multiple organizations.
-- Replace the global unique constraint with a per-tenant one.
ALTER TABLE members DROP INDEX uk_member_user;
ALTER TABLE members ADD CONSTRAINT uk_member_user_tenant UNIQUE (user_id, tenant_id);
