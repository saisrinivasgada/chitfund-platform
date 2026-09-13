CREATE TABLE hub_refresh_sessions (
    id           VARCHAR(36) PRIMARY KEY,
    employee_id  VARCHAR(36) NOT NULL,
    token_hash   CHAR(64) NOT NULL,
    auth_version BIGINT NOT NULL,
    expires_at   DATETIME(6) NOT NULL,
    revoked_at   DATETIME(6) NULL,
    created_at   DATETIME(6) NOT NULL,
    UNIQUE KEY uq_hub_refresh_hash (token_hash),
    INDEX idx_hub_refresh_employee (employee_id, revoked_at),
    CONSTRAINT fk_hub_refresh_employee FOREIGN KEY (employee_id) REFERENCES employees(id)
);
