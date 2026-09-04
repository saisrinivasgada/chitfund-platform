-- Intra-org DM conversations (one thread per member per org)
CREATE TABLE conversations (
    id                    VARCHAR(36)  PRIMARY KEY,
    tenant_id             VARCHAR(36)  NOT NULL,
    member_id             VARCHAR(36)  NOT NULL,
    member_name           VARCHAR(100) NOT NULL,
    last_message_at       DATETIME(6),
    last_message_preview  VARCHAR(200),
    last_message_is_admin TINYINT(1)   NOT NULL DEFAULT 0,
    admin_unread          INT          NOT NULL DEFAULT 0,
    member_unread         INT          NOT NULL DEFAULT 0,
    created_at            DATETIME(6)  NOT NULL,
    updated_at            DATETIME(6)  NOT NULL,
    UNIQUE KEY uq_conv (tenant_id, member_id),
    INDEX idx_conv_tenant_active (tenant_id, last_message_at DESC),
    INDEX idx_conv_member        (member_id)
);

-- Messages within a conversation
CREATE TABLE conversation_messages (
    id                VARCHAR(36)  PRIMARY KEY,
    conversation_id   VARCHAR(36)  NOT NULL,
    sender_id         VARCHAR(36)  NOT NULL,
    sender_name       VARCHAR(100) NOT NULL,
    sender_role       VARCHAR(20)  NOT NULL,   -- ADMIN | MANAGER | MEMBER
    content           TEXT         NOT NULL,
    client_message_id VARCHAR(36),             -- idempotency key, client-generated UUID
    deleted_at        DATETIME(6),
    created_at        DATETIME(6)  NOT NULL,
    INDEX idx_cmsg_conv_time (conversation_id, created_at),
    UNIQUE KEY uq_client_msg (conversation_id, client_message_id),
    CONSTRAINT fk_cmsg_conv FOREIGN KEY (conversation_id) REFERENCES conversations(id)
);
