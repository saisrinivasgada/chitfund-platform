-- Payment transactions cannot decide draw completion from an earlier transaction
-- snapshot. Reconcile committed installment state in a fresh transaction instead.
CREATE TABLE draw_reconciliation_queue (
    tenant_id VARCHAR(36) NOT NULL,
    chit_id VARCHAR(36) NOT NULL,
    month_number INT NOT NULL,
    check_reopen BOOLEAN NOT NULL DEFAULT FALSE,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (tenant_id, chit_id, month_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
