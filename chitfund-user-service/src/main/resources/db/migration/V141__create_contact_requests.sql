CREATE TABLE contact_requests (
    id          VARCHAR(36)  NOT NULL PRIMARY KEY,
    type        VARCHAR(20)  NOT NULL,
    name        VARCHAR(200),
    email       VARCHAR(200),
    phone       VARCHAR(50),
    subject     VARCHAR(500),
    message     TEXT         NOT NULL,
    tenant_id   VARCHAR(36),
    tenant_name VARCHAR(200),
    status      VARCHAR(20)  NOT NULL DEFAULT 'NEW',
    created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE INDEX idx_contact_requests_status  ON contact_requests(status);
CREATE INDEX idx_contact_requests_type    ON contact_requests(type);
CREATE INDEX idx_contact_requests_created ON contact_requests(created_at DESC);
