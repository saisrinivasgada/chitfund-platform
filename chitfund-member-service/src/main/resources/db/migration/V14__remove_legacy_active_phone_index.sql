-- V8's tenant-scoped phone index includes every row, including soft-deleted
-- history. V13 introduced the generated active_phone_slot uniqueness guard,
-- so the legacy index must be removed to let an organization legitimately
-- reuse a phone after the former profile is deleted.
ALTER TABLE members DROP INDEX uk_member_phone_tenant;
