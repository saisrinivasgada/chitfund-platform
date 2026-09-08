ALTER TABLE member_reminders
    CHANGE COLUMN is_removed is_archived BOOLEAN NOT NULL DEFAULT FALSE,
    CHANGE COLUMN removed_at archived_at TIMESTAMP NULL DEFAULT NULL;
