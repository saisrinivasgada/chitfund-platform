-- One ticket system serves authenticated organization support and anonymous
-- public inquiries. Existing organization tickets retain their original data.
ALTER TABLE support_tickets
    MODIFY tenant_id VARCHAR(36) NULL,
    MODIFY created_by VARCHAR(36) NULL,
    ADD COLUMN source VARCHAR(20) NOT NULL DEFAULT 'ORGANIZATION' AFTER type,
    ADD COLUMN tenant_name VARCHAR(100) NULL AFTER tenant_id,
    ADD COLUMN requester_email VARCHAR(255) NULL AFTER created_by_name,
    ADD COLUMN requester_phone VARCHAR(50) NULL AFTER requester_email,
    ADD COLUMN preferred_contact VARCHAR(20) NULL AFTER requester_phone,
    ADD INDEX idx_ticket_filters (status, type, priority, created_at),
    ADD INDEX idx_ticket_source (source, created_at);

