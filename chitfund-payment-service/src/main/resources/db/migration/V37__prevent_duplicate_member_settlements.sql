-- Phase A permits only one settlement row per member and tenant. Application-level
-- existence checks alone cannot stop two concurrent requests on different pods.
--
-- Deployment intentionally fails if legacy NULL tenant IDs or duplicate live
-- settlements exist. Do not auto-delete or guess which financial row is correct;
-- inspect and reconcile those rows before retrying this migration.
--
-- VOIDED rows remain blocking in this emergency phase because the current void
-- operation does not atomically reverse member deactivation and every downstream
-- effect. Phase B may replace this strict key with a generated active_slot only
-- after reversal/supersession is proven end to end.
ALTER TABLE settlements
    MODIFY COLUMN tenant_id VARCHAR(36) NOT NULL,
    ADD COLUMN idempotency_key VARCHAR(64) NULL AFTER voided_by,
    ADD COLUMN idempotency_request_hash CHAR(64) NULL AFTER idempotency_key,
    ADD UNIQUE KEY uk_settlement_tenant_idempotency (tenant_id, idempotency_key),
    ADD UNIQUE KEY uk_settlement_one_per_member (tenant_id, member_id);
