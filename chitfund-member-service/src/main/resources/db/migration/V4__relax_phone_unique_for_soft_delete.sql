-- A soft-deleted member still occupies the UNIQUE index on phone, blocking reuse
-- of that number for a new member. Drop the DB-level constraint; uniqueness among
-- ACTIVE members is enforced at the application layer (existsByPhoneAndDeletedAtIsNull).
ALTER TABLE members DROP INDEX uk_member_phone;
