-- Rename column: assigned_worker_id → assigned_staff_id
-- WHY: Worker role is being renamed to Staff across the platform for clearer terminology.
ALTER TABLE cash_payment_requests
    RENAME COLUMN assigned_worker_id TO assigned_staff_id;

DROP INDEX idx_cash_requests_worker ON cash_payment_requests;
CREATE INDEX idx_cash_requests_staff ON cash_payment_requests (assigned_staff_id);
