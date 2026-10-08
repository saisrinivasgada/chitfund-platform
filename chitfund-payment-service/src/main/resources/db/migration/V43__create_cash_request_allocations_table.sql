-- WHY cash_request_allocations?
-- Today a CashPaymentRequest (staff/manager pickup task) covers exactly one chit —
-- chit_id is required and requested_amount is a flat number. This table lets ONE
-- request cover several chits with a single total amount, recording the *intent*
-- ("collect ₹X, meant for these chits in these portions") before any cash changes
-- hands. It mirrors payment_allocations in shape, but payment_allocations records
-- FIFO *output* after the fact — this records the plan going in.
--
-- The legacy single-chit path is unaffected: a request with zero rows here still
-- uses cash_payment_requests.chit_id/requested_amount exactly as before. A request
-- gets rows here only when it was created covering more than one chit, and those
-- rows are what lets applyFifo() at remittance time restrict allocation to just
-- this set of chits instead of spilling into every other chit the member owes.
--
-- CREATE TABLE IF NOT EXISTS makes this safe to re-run — this is a brand-new
-- table, not an ALTER on an existing one, so no information_schema guard is
-- needed (see V4/V6/V9 for the same plain-CREATE style on new tables).

CREATE TABLE IF NOT EXISTS cash_request_allocations (
    id                  VARCHAR(36)    NOT NULL,
    tenant_id           VARCHAR(36)    NOT NULL,
    cash_request_id     VARCHAR(36)    NOT NULL,
    chit_id             VARCHAR(36)    NOT NULL,
    allocated_amount    DECIMAL(15,2)  NOT NULL,
    created_at          DATETIME(6)    NOT NULL,

    PRIMARY KEY (id),
    CONSTRAINT fk_cash_request_alloc_request FOREIGN KEY (cash_request_id)
        REFERENCES cash_payment_requests(id),
    INDEX idx_cash_request_allocations_request (cash_request_id),
    INDEX idx_cash_request_allocations_tenant  (tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
