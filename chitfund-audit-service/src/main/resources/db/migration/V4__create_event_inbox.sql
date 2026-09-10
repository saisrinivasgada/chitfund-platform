CREATE TABLE event_inbox (
    event_id      VARCHAR(36) NOT NULL,
    event_type    VARCHAR(64) NOT NULL,
    processed_at  DATETIME(6) NOT NULL,
    PRIMARY KEY (event_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
