-- WHY a separate cash_payment_requests table?
-- Members can't call workers directly. This table is the coordination layer:
--   Member submits request → Admin sees it → Admin assigns a worker → Worker collects
-- This keeps the two-step cash flow (collect → remit) intact while adding the pre-collection step.
-- The request lifecycle: PENDING → ASSIGNED → COLLECTED (or CANCELLED at any step by admin).

CREATE TABLE cash_payment_requests (
    id                  VARCHAR(36)     NOT NULL,
    member_id           VARCHAR(36)     NOT NULL,
    chit_id             VARCHAR(36)     NOT NULL,
    requested_amount    DECIMAL(15,2),              -- NULL means "collect whatever is outstanding"
    status              VARCHAR(20)     NOT NULL,   -- PENDING | ASSIGNED | COLLECTED | CANCELLED
    assigned_worker_id  VARCHAR(36),                -- set when admin assigns a worker
    assigned_at         DATETIME(6),
    assigned_by         VARCHAR(36),                -- admin who assigned
    notes               TEXT,                       -- member's note (e.g. "I'll be home after 6pm")
    admin_notes         TEXT,                       -- internal notes by admin
    collected_batch_id  VARCHAR(36),                -- FK to payment_batches after collection
    requested_at        DATETIME(6)     NOT NULL,
    updated_at          DATETIME(6)     NOT NULL,

    PRIMARY KEY (id),
    INDEX idx_cash_requests_member  (member_id),
    INDEX idx_cash_requests_status  (status),
    INDEX idx_cash_requests_worker  (assigned_worker_id),
    INDEX idx_cash_requests_chit    (chit_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
