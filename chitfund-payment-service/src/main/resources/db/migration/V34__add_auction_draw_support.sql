-- Add AWAITING_AUCTION status support and auction_mode to draws
ALTER TABLE chit_month_draws
    MODIFY COLUMN status VARCHAR(20) NOT NULL,
    ADD COLUMN auction_mode VARCHAR(10) NULL
        COMMENT 'ONLINE or OFFLINE; null for non-auction draws';

-- Add dividend breakdown fields to payment_records
ALTER TABLE payment_records
    ADD COLUMN gross_installment_amount DECIMAL(15,2) NULL
        COMMENT 'Full installment before auction dividend; null for non-auction draws',
    ADD COLUMN dividend_deducted_amount DECIMAL(15,2) NULL
        COMMENT 'Auction dividend reducing this member installment; null for non-auction draws';
