ALTER TABLE cash_payment_requests
    ADD COLUMN collected_amount DECIMAL(15,2) NULL COMMENT 'Actual amount worker collected in a partial pickup',
    ADD COLUMN member_approved BOOLEAN NULL COMMENT 'NULL=pending, TRUE=approved, FALSE=rejected by member',
    ADD COLUMN member_rejection_reason TEXT NULL COMMENT 'Reason given by member when they reject a partial collection',
    ADD COLUMN partially_collected_at DATETIME(6) NULL COMMENT 'Timestamp when worker marked partial collection',
    ADD COLUMN parent_request_id VARCHAR(36) NULL COMMENT 'Links a follow-up request back to the original partially-collected one';
