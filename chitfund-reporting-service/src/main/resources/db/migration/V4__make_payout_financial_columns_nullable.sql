-- PAYOUT_DISBURSED events may arrive before PAYOUT_CREATED in Kafka replay scenarios.
-- Allow null financial columns so a partial row can be inserted and later filled in.
ALTER TABLE payout_summaries
    MODIFY COLUMN winning_amount  DECIMAL(15,2) NULL,
    MODIFY COLUMN discount_amount DECIMAL(15,2) NULL;
