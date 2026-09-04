-- Bid rows previously inherited tenant ownership only indirectly from their
-- auction session. Persist it explicitly so every query can fail closed.
ALTER TABLE auction_bids
    ADD COLUMN tenant_id VARCHAR(36) NULL AFTER id;

UPDATE auction_bids bid
INNER JOIN auction_sessions session ON session.id = bid.auction_session_id
SET bid.tenant_id = session.tenant_id
WHERE bid.tenant_id IS NULL;

CREATE INDEX idx_bid_tenant_session_rank
    ON auction_bids (tenant_id, auction_session_id, discount_offered DESC, bid_time ASC);
