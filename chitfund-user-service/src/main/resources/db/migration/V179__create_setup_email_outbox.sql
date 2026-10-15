-- Transactionally-safe outbox for setup email delivery.
-- Entries are written inside the same transaction as the ChitfundAccessRequest
-- so a rollback never leaves a dangling delivery.  The relay reads and delivers
-- asynchronously after commit, with exponential-backoff retry.
CREATE TABLE setup_email_outbox (
    delivery_id       VARCHAR(36)   NOT NULL PRIMARY KEY,
    request_id        VARCHAR(36)   NOT NULL,
    candidate_user_id VARCHAR(36)   NOT NULL,
    to_email          VARCHAR(320)  NOT NULL,
    full_name         VARCHAR(255),
    org_name          VARCHAR(255)  NOT NULL,
    status            VARCHAR(20)   NOT NULL DEFAULT 'PENDING',
    attempts          INT           NOT NULL DEFAULT 0,
    available_at      DATETIME(6)   NOT NULL,
    claimed_until     DATETIME(6),
    lease_token       VARCHAR(36),
    completed_at      DATETIME(6),
    last_error_code   VARCHAR(255),
    last_error        VARCHAR(2000),
    created_at        DATETIME(6)   NOT NULL,
    CONSTRAINT uq_setup_email_request UNIQUE (request_id),
    INDEX idx_setup_email_pending (status, available_at)
) ENGINE=InnoDB;

-- Track delivery outcome on the request itself so the admin sees it.
ALTER TABLE chitfund_access_requests
    ADD COLUMN setup_email_status   VARCHAR(20) NOT NULL DEFAULT 'UNAVAILABLE',
    ADD COLUMN setup_email_sent_at  DATETIME(6);
