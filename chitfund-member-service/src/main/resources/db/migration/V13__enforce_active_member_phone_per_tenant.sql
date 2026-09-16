-- An active profile's contact phone is unique inside one organization, while
-- the same person may have profiles in different organizations. Deleted
-- historical rows receive NULL and therefore do not block legitimate reuse.
ALTER TABLE members
    ADD COLUMN active_phone_slot TINYINT GENERATED ALWAYS AS (
        CASE WHEN deleted_at IS NULL THEN 1 ELSE NULL END
    ) STORED,
    ADD UNIQUE KEY uq_members_tenant_active_phone
        (tenant_id, phone_country_code, phone, active_phone_slot);
