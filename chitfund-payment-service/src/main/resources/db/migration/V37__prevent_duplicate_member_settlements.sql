-- A member may have only one non-voided settlement per tenant. Application-level
-- existence checks alone cannot stop two concurrent requests on different pods.
--
-- Deployment intentionally fails if legacy NULL tenant IDs or duplicate live
-- settlements exist. Do not auto-delete or guess which financial row is correct;
-- inspect and reconcile those rows before retrying this migration.
--
-- MySQL UNIQUE indexes allow multiple NULL values. active_slot is 1 for every
-- non-VOIDED settlement and NULL for VOIDED history, so only one live row competes
-- for each tenant/member while any number of voided audit rows remain possible.
ALTER TABLE settlements
    MODIFY COLUMN tenant_id VARCHAR(36) NOT NULL,
    ADD COLUMN idempotency_key VARCHAR(64) NULL AFTER voided_by,
    ADD COLUMN idempotency_request_hash CHAR(64) NULL AFTER idempotency_key,
    ADD COLUMN active_slot TINYINT
        GENERATED ALWAYS AS (
            CASE WHEN payment_status <> 'VOIDED' THEN 1 ELSE NULL END
        ) STORED,
    ADD UNIQUE KEY uk_settlement_tenant_idempotency (tenant_id, idempotency_key),
    ADD UNIQUE KEY uk_settlement_one_live_per_member (tenant_id, member_id, active_slot);
