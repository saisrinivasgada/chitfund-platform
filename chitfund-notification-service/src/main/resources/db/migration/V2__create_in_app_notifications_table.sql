CREATE TABLE in_app_notifications (
    id           VARCHAR(36)  NOT NULL PRIMARY KEY,
    recipient_id VARCHAR(36)  NOT NULL,
    title        VARCHAR(120) NOT NULL,
    message      TEXT         NOT NULL,
    type         VARCHAR(50)  NOT NULL,
    metadata     TEXT,
    is_read      TINYINT(1)   NOT NULL DEFAULT 0,
    created_at   DATETIME     NOT NULL,
    INDEX idx_ian_recipient       (recipient_id),
    INDEX idx_ian_recipient_read  (recipient_id, is_read)
);
