-- A payout can be disbursed in several partial transactions. A client retry after
-- a lost response must return the first transaction rather than moving money a
-- second time. Existing rows remain valid; all new API writes require a key.
ALTER TABLE payout_disbursements
    ADD COLUMN idempotency_key VARCHAR(64) NULL AFTER disbursed_at,
    ADD COLUMN idempotency_request_hash CHAR(64) NULL AFTER idempotency_key,
    ADD UNIQUE KEY uq_payout_disbursement_idempotency (payout_id, idempotency_key);
