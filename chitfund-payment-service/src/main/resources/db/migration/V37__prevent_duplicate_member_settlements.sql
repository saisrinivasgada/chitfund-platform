-- Phase A permits only one non-VOIDED settlement row per member and tenant. Application-level
-- existence checks alone cannot stop two concurrent requests on different pods.
--
-- Deployment intentionally fails if legacy NULL tenant IDs or duplicate live
-- settlements exist. Do not auto-delete or guess which financial row is correct;
-- inspect and reconcile those rows before retrying this migration.
--
-- The service still blocks legacy re-settlement: this generated key avoids making
-- harmless historical VOIDED rows prevent V37 from installing. V38 replaces the
-- expression with the final VOIDED-or-SUPERSEDED definition.
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
