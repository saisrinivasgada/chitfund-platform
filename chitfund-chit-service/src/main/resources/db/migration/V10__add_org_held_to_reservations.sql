ALTER TABLE month_reservations
    ADD COLUMN org_held TINYINT(1) NOT NULL DEFAULT 0 AFTER member_id;

ALTER TABLE month_reservations
    ADD INDEX idx_reservations_org_held (org_held);
