CREATE TABLE contact_request_messages (
    id                 VARCHAR(36)  NOT NULL PRIMARY KEY,
    contact_request_id VARCHAR(36) NOT NULL,
    sender_type        VARCHAR(20) NOT NULL, -- SUPER_ADMIN
    sender_name        VARCHAR(200),
    content            TEXT         NOT NULL,
    created_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_contact_request_messages_request
        FOREIGN KEY (contact_request_id) REFERENCES contact_requests(id) ON DELETE CASCADE
);

CREATE INDEX idx_contact_request_messages_request ON contact_request_messages(contact_request_id, created_at);
