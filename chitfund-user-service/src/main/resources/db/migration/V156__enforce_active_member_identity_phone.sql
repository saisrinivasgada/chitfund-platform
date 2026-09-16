-- A recovery phone identifies one live global MEMBER identity. Staff/admin
-- accounts remain a separate login category and retired/deleted identities do
-- not block a number from being safely reassigned after owner approval.
ALTER TABLE users
    ADD COLUMN active_member_phone_key VARCHAR(32) GENERATED ALWAYS AS (
        CASE
            WHEN role = 'MEMBER' AND deleted_at IS NULL AND phone IS NOT NULL
            THEN CONCAT(COALESCE(phone_country_code, '+91'), ':', phone)
            ELSE NULL
        END
    ) STORED,
    ADD UNIQUE KEY uq_users_active_member_phone (active_member_phone_key);
