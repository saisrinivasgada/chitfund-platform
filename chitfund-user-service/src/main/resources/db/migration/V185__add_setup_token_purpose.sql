-- Add a purpose discriminator to account_setup_tokens so CHITFUND_REQUEST tokens
-- and ORG_USER_INVITE tokens cannot be used interchangeably.
--
-- Backfill strategy:
--   • Rows with chitfund_request_id NOT NULL  → CHITFUND_REQUEST
--   • Rows with chitfund_request_id IS NULL   → ORG_USER_INVITE
-- This correctly classifies all pre-existing tokens created by the two callers.

ALTER TABLE account_setup_tokens
  ADD COLUMN purpose VARCHAR(30) NULL AFTER chitfund_request_id;

UPDATE account_setup_tokens
SET purpose = 'CHITFUND_REQUEST'
WHERE chitfund_request_id IS NOT NULL;

UPDATE account_setup_tokens
SET purpose = 'ORG_USER_INVITE'
WHERE chitfund_request_id IS NULL;

ALTER TABLE account_setup_tokens
  MODIFY COLUMN purpose VARCHAR(30) NOT NULL;

CREATE INDEX idx_ast_user_purpose ON account_setup_tokens (user_id, purpose);
