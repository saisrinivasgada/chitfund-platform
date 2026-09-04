CREATE TABLE chat_groups (
    id VARCHAR(36) PRIMARY KEY,
    tenant_id VARCHAR(36) NOT NULL,
    name VARCHAR(100) NOT NULL,
    description VARCHAR(500),
    created_by VARCHAR(36) NOT NULL,
    created_by_name VARCHAR(100) NOT NULL,
    member_count INT NOT NULL DEFAULT 0,
    last_message_at DATETIME(6),
    last_message_preview VARCHAR(200),
    created_at DATETIME(6) NOT NULL,
    updated_at DATETIME(6) NOT NULL,
    INDEX idx_cg_tenant (tenant_id),
    INDEX idx_cg_tenant_active (tenant_id, last_message_at DESC)
);

CREATE TABLE chat_group_members (
    id VARCHAR(36) PRIMARY KEY,
    group_id VARCHAR(36) NOT NULL,
    user_id VARCHAR(36) NOT NULL,
    user_name VARCHAR(100) NOT NULL,
    role VARCHAR(20) NOT NULL,
    joined_at DATETIME(6) NOT NULL,
    UNIQUE KEY uq_cgm (group_id, user_id),
    INDEX idx_cgm_group (group_id),
    INDEX idx_cgm_user (user_id),
    CONSTRAINT fk_cgm_group FOREIGN KEY (group_id) REFERENCES chat_groups(id)
);

CREATE TABLE chat_group_messages (
    id VARCHAR(36) PRIMARY KEY,
    group_id VARCHAR(36) NOT NULL,
    sender_id VARCHAR(36) NOT NULL,
    sender_name VARCHAR(100) NOT NULL,
    sender_role VARCHAR(20) NOT NULL,
    content TEXT NOT NULL,
    client_message_id VARCHAR(36),
    deleted_at DATETIME(6),
    created_at DATETIME(6) NOT NULL,
    INDEX idx_cgmsg_group_time (group_id, created_at),
    UNIQUE KEY uq_cgmsg_idempotency (group_id, sender_id, client_message_id),
    CONSTRAINT fk_cgmsg_group FOREIGN KEY (group_id) REFERENCES chat_groups(id)
);
