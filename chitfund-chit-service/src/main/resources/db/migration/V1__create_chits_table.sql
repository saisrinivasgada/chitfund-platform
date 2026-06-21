CREATE TABLE chits (
    id                    VARCHAR(36)    NOT NULL,
    name                  VARCHAR(100)   NOT NULL,
    description           TEXT,
    installment_amount    DECIMAL(15,2)  NOT NULL,
    total_amount          DECIMAL(15,2)  NOT NULL,
    total_members         INT            NOT NULL,
    duration_months       INT            NOT NULL,
    winner_selection_mode VARCHAR(20)    NOT NULL,
    status                VARCHAR(20)    NOT NULL DEFAULT 'DRAFT',
    start_date            DATE,
    end_date              DATE,
    created_by            VARCHAR(36)    NOT NULL,
    created_at            DATETIME(6)    NOT NULL,
    updated_at            DATETIME(6)    NOT NULL,

    PRIMARY KEY (id),
    INDEX idx_chits_status     (status),
    INDEX idx_chits_created_by (created_by)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
