-- V6 protected one active payout per chit/month, but omitted tenant_id and member_id.
-- That both weakened tenant isolation and prevented legitimate multi-winner draws.
-- Keep historical CANCELLED/VOIDED rows (active_month = NULL) while allowing one
-- live payout for each tenant + chit + draw + winning member.

ALTER TABLE payouts
    DROP INDEX uk_payout_chit_active_month;

ALTER TABLE payouts
    ADD UNIQUE KEY uq_payout_tenant_chit_month_member_active (
        tenant_id, chit_id, active_month, member_id
    );
