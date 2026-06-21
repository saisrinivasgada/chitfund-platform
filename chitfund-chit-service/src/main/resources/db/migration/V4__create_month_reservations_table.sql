-- WHY version column?
-- Optimistic locking: prevents two members from reserving the same month simultaneously.
-- @Version on the entity maps to this column. Hibernate auto-increments it on each UPDATE
-- and checks it on the WHERE clause: WHERE id=? AND version=<expected>.
-- If another transaction already incremented it, this UPDATE affects 0 rows → conflict detected.

CREATE TABLE month_reservations (
    id           VARCHAR(36)  NOT NULL,
    chit_id      VARCHAR(36)  NOT NULL,
    member_id    VARCHAR(36)  NOT NULL,
    month_number INT          NOT NULL,
    version      INT          NOT NULL DEFAULT 0,
    created_at   DATETIME(6)  NOT NULL,

    PRIMARY KEY (id),
    UNIQUE KEY uk_chit_month_reservation (chit_id, month_number),
    CONSTRAINT fk_reservation_chit FOREIGN KEY (chit_id) REFERENCES chits(id),
    INDEX idx_reservations_chit (chit_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
