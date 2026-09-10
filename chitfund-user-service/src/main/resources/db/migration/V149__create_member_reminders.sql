CREATE TABLE member_reminders (
    id VARCHAR(36) DEFAULT (UUID()) PRIMARY KEY,
    org_id VARCHAR(36) NOT NULL,
    sender_id VARCHAR(36) NOT NULL,
    sender_name VARCHAR(200),
    member_user_id VARCHAR(36) NOT NULL,
    member_profile_id VARCHAR(36) NOT NULL,
    message TEXT,
    chit_details TEXT NOT NULL,
    total_amount NUMERIC(15, 2) NOT NULL DEFAULT 0,
    repeat_interval_minutes INT,
    reminder_time VARCHAR(5),
    seen_at TIMESTAMP,
    read_at TIMESTAMP,
    promised_date DATE,
    is_removed BOOLEAN NOT NULL DEFAULT FALSE,
    removed_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_reminders_org_member ON member_reminders(org_id, member_profile_id);
CREATE INDEX idx_reminders_member_user ON member_reminders(member_user_id);
