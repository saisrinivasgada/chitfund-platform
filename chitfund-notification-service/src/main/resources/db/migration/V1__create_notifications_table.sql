-- Every notification attempt is logged here — sent and failed.
-- WHY log failures? Supports retry logic and lets admin see "member never got the SMS".
-- WHY keep delivered messages? Audit trail — "we notified on 2026-06-01 at 14:32".
--
-- external_id: the provider's own message ID (MSG91 request ID, Twilio SID).
-- Null for LOGGING mode (dev) and for failed sends.
--
-- template_params stored as JSON so we can re-render or debug the exact values used.

CREATE TABLE notifications (
    id                VARCHAR(36)    NOT NULL,
    recipient_id      VARCHAR(36)    NOT NULL,
    recipient_phone   VARCHAR(15),
    recipient_email   VARCHAR(100),
    channel           VARCHAR(20)    NOT NULL,
    event_type        VARCHAR(50)    NOT NULL,
    message           TEXT           NOT NULL,
    status            VARCHAR(20)    NOT NULL,
    error_message     TEXT,
    external_id       VARCHAR(100),
    sent_at           DATETIME(6),
    created_at        DATETIME(6)    NOT NULL,

    PRIMARY KEY (id),
    INDEX idx_notif_recipient  (recipient_id),
    INDEX idx_notif_event_type (event_type),
    INDEX idx_notif_status     (status),
    INDEX idx_notif_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
