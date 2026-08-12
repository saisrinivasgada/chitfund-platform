CREATE TABLE tenants (
    id          VARCHAR(36)   NOT NULL,
    name        VARCHAR(100)  NOT NULL,
    slug        VARCHAR(50)   NOT NULL,
    status      VARCHAR(20)   NOT NULL DEFAULT 'ACTIVE',
    plan        VARCHAR(20)   NOT NULL DEFAULT 'BASIC',
    contact_phone VARCHAR(20),
    contact_email VARCHAR(100),
    created_by  VARCHAR(36),
    created_at  DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at  DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),

    PRIMARY KEY (id),
    UNIQUE KEY uk_tenant_slug (slug),
    INDEX idx_tenant_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO tenants (id, name, slug, status, plan, created_at, updated_at)
VALUES ('10000000-0000-0000-0000-000000000001', 'Kethaki Chitfunds', 'kethakichitfunds', 'ACTIVE', 'PRO', NOW(), NOW());
