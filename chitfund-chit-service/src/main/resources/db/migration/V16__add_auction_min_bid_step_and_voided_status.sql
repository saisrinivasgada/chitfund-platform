-- Add minimum bid step per auction session (ONLINE auctions only)
-- Enforces a minimum gap between consecutive bids to prevent micro-competition
ALTER TABLE auction_sessions
    ADD COLUMN min_bid_step DECIMAL(15, 2) DEFAULT NULL;

-- Extend status enum to include VOIDED (allows re-auction without deleting old session)
-- PostgreSQL enums require ALTER TYPE; MySQL requires MODIFY COLUMN
-- Using VARCHAR(10) as confirmed in entity: columnDefinition = "varchar(10)"
-- No DDL change needed — VOIDED is a new string value that fits in varchar(10)
