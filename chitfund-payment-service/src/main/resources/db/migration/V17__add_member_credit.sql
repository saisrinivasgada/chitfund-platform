-- Global credit wallet — one row per member, shared across all chits.
-- WHY not per-chit? Credit reflects overpayment by the member as a person,
-- not for a specific chit. If they overpay in Chit A, that trust carries to Chit B.
CREATE TABLE member_credit_balance (
    id          VARCHAR(36)    NOT NULL,
    member_id   VARCHAR(36)    NOT NULL,
    balance     DECIMAL(15,2)  NOT NULL DEFAULT 0.00,
    created_at  DATETIME(6)    NOT NULL,
    updated_at  DATETIME(6),
    PRIMARY KEY (id),
    UNIQUE KEY uq_credit_member (member_id)
);

-- Audit every credit movement so void can perfectly reverse it.
-- type = 'IN'  → credit added to member (overpayment)
-- type = 'OUT' → credit consumed from member (auto-applied to outstanding)
CREATE TABLE member_credit_transactions (
    id              VARCHAR(36)    NOT NULL,
    member_id       VARCHAR(36)    NOT NULL,
    amount          DECIMAL(15,2)  NOT NULL,
    type            VARCHAR(10)    NOT NULL,
    source_batch_id VARCHAR(36),
    chit_id         VARCHAR(36),
    description     VARCHAR(500),
    created_at      DATETIME(6)    NOT NULL,
    created_by      VARCHAR(36),
    PRIMARY KEY (id),
    INDEX idx_crtx_member (member_id),
    INDEX idx_crtx_batch  (source_batch_id)
);
