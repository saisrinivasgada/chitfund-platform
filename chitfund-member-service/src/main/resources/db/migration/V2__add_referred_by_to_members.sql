ALTER TABLE members
    ADD COLUMN referred_by_id CHAR(36) NULL AFTER notes,
    ADD CONSTRAINT fk_members_referred_by
        FOREIGN KEY (referred_by_id) REFERENCES members (id)
        ON DELETE SET NULL;
