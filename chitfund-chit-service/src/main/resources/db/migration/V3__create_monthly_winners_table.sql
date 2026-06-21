CREATE TABLE monthly_winners (
    id              VARCHAR(36)    NOT NULL,
    chit_id         VARCHAR(36)    NOT NULL,
    member_id       VARCHAR(36)    NOT NULL,
    month_number    INT            NOT NULL,
    selection_mode  VARCHAR(20)    NOT NULL,
    winning_amount  DECIMAL(15,2)  NOT NULL,
    discount_amount DECIMAL(15,2),
    assigned_at     DATETIME(6)    NOT NULL,
    assigned_by     VARCHAR(36)    NOT NULL,

    PRIMARY KEY (id),
    UNIQUE KEY uk_chit_month_winner (chit_id, month_number),
    CONSTRAINT fk_winner_chit FOREIGN KEY (chit_id) REFERENCES chits(id),
    INDEX idx_winners_chit (chit_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
