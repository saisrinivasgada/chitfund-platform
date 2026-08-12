CREATE TABLE tenant_discounts (
    id             VARCHAR(36)                      NOT NULL,
    tenant_id      VARCHAR(36)                      NOT NULL,
    discount_type  ENUM('PERCENTAGE','FIXED_PAISE') NOT NULL,
    discount_value DECIMAL(12,2)                    NOT NULL,
    reason         VARCHAR(500)                     NULL,
    created_at     DATETIME(6)                      NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    expires_at     DATETIME(6)                      NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_tenant_discount (tenant_id),
    CONSTRAINT fk_td_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
