-- Hub internal employee-to-employee DMs
CREATE TABLE hub_conversations (
    id VARCHAR(36) PRIMARY KEY,
    employee1_id VARCHAR(36) NOT NULL,
    employee2_id VARCHAR(36) NOT NULL,
    last_message_at DATETIME(6),
    last_message_preview VARCHAR(200),
    employee1_unread INT NOT NULL DEFAULT 0,
    employee2_unread INT NOT NULL DEFAULT 0,
    created_at DATETIME(6) NOT NULL,
    updated_at DATETIME(6) NOT NULL,
    UNIQUE KEY uq_hub_conv (employee1_id, employee2_id),
    INDEX idx_hconv_e1 (employee1_id),
    INDEX idx_hconv_e2 (employee2_id)
);

CREATE TABLE hub_conversation_messages (
    id VARCHAR(36) PRIMARY KEY,
    conversation_id VARCHAR(36) NOT NULL,
    sender_id VARCHAR(36) NOT NULL,
    sender_name VARCHAR(100) NOT NULL,
    content TEXT NOT NULL,
    client_message_id VARCHAR(36),
    deleted_at DATETIME(6),
    created_at DATETIME(6) NOT NULL,
    INDEX idx_hcmsg_conv (conversation_id, created_at),
    UNIQUE KEY uq_hcmsg_idem (conversation_id, sender_id, client_message_id),
    CONSTRAINT fk_hcmsg_conv FOREIGN KEY (conversation_id) REFERENCES hub_conversations(id)
);

-- Hub internal group chats (cross-team, no tenant scoping)
CREATE TABLE hub_groups (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description VARCHAR(500),
    created_by VARCHAR(36) NOT NULL,
    created_by_name VARCHAR(100) NOT NULL,
    member_count INT NOT NULL DEFAULT 0,
    last_message_at DATETIME(6),
    last_message_preview VARCHAR(200),
    created_at DATETIME(6) NOT NULL,
    updated_at DATETIME(6) NOT NULL
);

CREATE TABLE hub_group_members (
    id VARCHAR(36) PRIMARY KEY,
    group_id VARCHAR(36) NOT NULL,
    employee_id VARCHAR(36) NOT NULL,
    employee_name VARCHAR(100) NOT NULL,
    joined_at DATETIME(6) NOT NULL,
    UNIQUE KEY uq_hgm (group_id, employee_id),
    INDEX idx_hgm_group (group_id),
    INDEX idx_hgm_emp (employee_id),
    CONSTRAINT fk_hgm_group FOREIGN KEY (group_id) REFERENCES hub_groups(id)
);

CREATE TABLE hub_group_messages (
    id VARCHAR(36) PRIMARY KEY,
    group_id VARCHAR(36) NOT NULL,
    sender_id VARCHAR(36) NOT NULL,
    sender_name VARCHAR(100) NOT NULL,
    content TEXT NOT NULL,
    client_message_id VARCHAR(36),
    deleted_at DATETIME(6),
    created_at DATETIME(6) NOT NULL,
    INDEX idx_hgmsg_group (group_id, created_at),
    UNIQUE KEY uq_hgmsg_idem (group_id, sender_id, client_message_id),
    CONSTRAINT fk_hgmsg_group FOREIGN KEY (group_id) REFERENCES hub_groups(id)
);
