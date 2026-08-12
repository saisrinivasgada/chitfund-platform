CREATE TABLE user_tenant_memberships (
    id          VARCHAR(36)   NOT NULL,
    user_id     VARCHAR(36)   NOT NULL,
    tenant_id   VARCHAR(36)   NOT NULL,
    role        VARCHAR(20)   NOT NULL,
    member_id   VARCHAR(36)   NULL,
    created_at  DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    PRIMARY KEY (id),
    UNIQUE KEY uk_user_tenant (user_id, tenant_id),
    INDEX idx_utm_user_id (user_id),
    INDEX idx_utm_tenant_id (tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Backfill: link all existing users to Kethaki Chitfunds
INSERT INTO user_tenant_memberships (id, user_id, tenant_id, role, member_id, created_at)
SELECT
    UUID(),
    id,
    '10000000-0000-0000-0000-000000000001',
    role,
    NULL,
    NOW()
FROM users
WHERE deleted_at IS NULL
  AND role != 'SUPER_ADMIN';
