-- WHY a snapshot table instead of querying payment-service directly?
-- CQRS Read Model: reporting-service owns a denormalized copy of the data
-- it needs. Reads are instant (local DB), no cross-service HTTP calls at query time.
-- The snapshot is pushed by payment-service on every payment event.
--
-- settled_count + partially_paid_count + outstanding_count + waived_count = total_members
-- total_collected + total_outstanding = installment_amount * total_members (minus waived)

CREATE TABLE monthly_collection_snapshots (
    id                      VARCHAR(36)    NOT NULL,
    chit_id                 VARCHAR(36)    NOT NULL,
    chit_name               VARCHAR(100),
    month_number            INT            NOT NULL,
    due_date                DATE           NOT NULL,
    installment_amount      DECIMAL(15,2)  NOT NULL,
    total_members           INT            NOT NULL,
    settled_count           INT            NOT NULL DEFAULT 0,
    partially_paid_count    INT            NOT NULL DEFAULT 0,
    outstanding_count       INT            NOT NULL DEFAULT 0,
    waived_count            INT            NOT NULL DEFAULT 0,
    total_collected         DECIMAL(15,2)  NOT NULL DEFAULT 0.00,
    total_outstanding       DECIMAL(15,2)  NOT NULL DEFAULT 0.00,
    cycle_status            VARCHAR(20)    NOT NULL,
    skip_reason             TEXT,
    last_updated            DATETIME(6)    NOT NULL,

    PRIMARY KEY (id),
    UNIQUE KEY uk_snapshot (chit_id, month_number),
    INDEX idx_snap_chit    (chit_id),
    INDEX idx_snap_status  (cycle_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
