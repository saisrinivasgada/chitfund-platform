CREATE TABLE hub_custom_roles (
    id           VARCHAR(36)  PRIMARY KEY,
    name         VARCHAR(100) NOT NULL UNIQUE,
    description  VARCHAR(500),
    created_at   DATETIME(6)  NOT NULL,
    updated_at   DATETIME(6)  NOT NULL
);

CREATE TABLE hub_role_permissions (
    role_id    VARCHAR(36)  NOT NULL,
    permission VARCHAR(100) NOT NULL,
    PRIMARY KEY (role_id, permission),
    CONSTRAINT fk_role_perm_role FOREIGN KEY (role_id) REFERENCES hub_custom_roles(id) ON DELETE CASCADE
);

ALTER TABLE employees
    ADD COLUMN custom_role_id VARCHAR(36) NULL,
    ADD CONSTRAINT fk_employee_custom_role FOREIGN KEY (custom_role_id) REFERENCES hub_custom_roles(id) ON DELETE SET NULL;
