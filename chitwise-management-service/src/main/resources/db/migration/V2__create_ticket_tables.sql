CREATE TABLE support_tickets (
    id                VARCHAR(36) PRIMARY KEY,
    ticket_number     VARCHAR(20) NOT NULL,
    type              VARCHAR(30) NOT NULL,
    tenant_id         VARCHAR(36) NOT NULL,
    created_by        VARCHAR(36) NOT NULL,
    created_by_name   VARCHAR(100),
    subject           VARCHAR(255) NOT NULL,
    description       TEXT,
    priority          VARCHAR(20) NOT NULL DEFAULT 'NORMAL',
    status            VARCHAR(30) NOT NULL DEFAULT 'OPEN',
    assigned_to       VARCHAR(36),
    assigned_to_name  VARCHAR(100),
    first_response_at DATETIME(6),
    resolved_at       DATETIME(6),
    created_at        DATETIME(6) NOT NULL,
    updated_at        DATETIME(6) NOT NULL,
    UNIQUE KEY uq_ticket_number (ticket_number),
    INDEX idx_tenant_status (tenant_id, status),
    INDEX idx_assigned (assigned_to),
    INDEX idx_created_by (created_by),
    INDEX idx_created_at (created_at)
);

CREATE TABLE ticket_messages (
    id               VARCHAR(36) PRIMARY KEY,
    ticket_id        VARCHAR(36) NOT NULL,
    sender_id        VARCHAR(36) NOT NULL,
    sender_type      VARCHAR(20) NOT NULL,
    sender_name      VARCHAR(100) NOT NULL,
    content          TEXT NOT NULL,
    deleted_at       DATETIME(6),
    read_by_creator  TINYINT(1) NOT NULL DEFAULT 0,
    read_by_handler  TINYINT(1) NOT NULL DEFAULT 0,
    created_at       DATETIME(6) NOT NULL,
    INDEX idx_ticket_time (ticket_id, created_at),
    CONSTRAINT fk_ticket_msg FOREIGN KEY (ticket_id) REFERENCES support_tickets(id)
);

CREATE TABLE ticket_assignments (
    id          VARCHAR(36) PRIMARY KEY,
    ticket_id   VARCHAR(36) NOT NULL,
    assigned_to VARCHAR(36) NOT NULL,
    assigned_by VARCHAR(36) NOT NULL,
    note        VARCHAR(255),
    assigned_at DATETIME(6) NOT NULL,
    INDEX idx_ticket (ticket_id),
    CONSTRAINT fk_assign_ticket FOREIGN KEY (ticket_id) REFERENCES support_tickets(id)
);

CREATE TABLE ticket_number_seq (
    year INT NOT NULL,
    last_val INT NOT NULL DEFAULT 0,
    PRIMARY KEY (year)
);
