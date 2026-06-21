CREATE TABLE chit_enrollments (
    id          VARCHAR(36)   NOT NULL,
    chit_id     VARCHAR(36)   NOT NULL,
    member_id   VARCHAR(36)   NOT NULL,
    enrolled_at DATETIME(6)   NOT NULL,
    active      TINYINT(1)    NOT NULL DEFAULT 1,

    PRIMARY KEY (id),
    UNIQUE KEY uk_chit_member (chit_id, member_id),
    CONSTRAINT fk_enrollment_chit FOREIGN KEY (chit_id) REFERENCES chits(id),
    INDEX idx_enrollments_chit_active (chit_id, active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
