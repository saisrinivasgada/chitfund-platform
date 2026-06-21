CREATE TABLE notifications (
    id                VARCHAR(36)  NOT NULL,
    recipient_user_id VARCHAR(36)  NULL,
    recipient_role    VARCHAR(20)  NULL,
    type              VARCHAR(60)  NOT NULL,
    title             VARCHAR(200) NOT NULL,
    message           TEXT         NOT NULL,
    entity_type       VARCHAR(50)  NULL,
    entity_id         VARCHAR(36)  NULL,
    link              VARCHAR(300) NULL,
    created_at        DATETIME(6)  NOT NULL,
    PRIMARY KEY (id),
    INDEX idx_notif_user    (recipient_user_id),
    INDEX idx_notif_role    (recipient_role),
    INDEX idx_notif_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE notification_reads (
    user_id         VARCHAR(36) NOT NULL,
    notification_id VARCHAR(36) NOT NULL,
    read_at         DATETIME(6) NOT NULL,
    PRIMARY KEY (user_id, notification_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
