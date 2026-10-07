-- Excess auction dividends become member credit. Link each immutable movement
-- to its draw so reopening or voiding that auction can reverse the exact credit
-- without touching unrelated member funds.
ALTER TABLE member_credit_transactions
    ADD COLUMN source_draw_id VARCHAR(36) NULL AFTER source_settlement_id,
    ADD INDEX idx_credit_draw (tenant_id, source_draw_id);
