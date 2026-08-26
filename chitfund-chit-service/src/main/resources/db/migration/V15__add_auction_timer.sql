-- Add timer support to auction sessions
ALTER TABLE auction_sessions
    ADD COLUMN closes_at DATETIME NULL COMMENT 'When the auction auto-closes; NULL = no timer (manual close only)';

-- Index for the scheduler job that polls for expired auctions
CREATE INDEX idx_auction_closes_at ON auction_sessions (closes_at, status);
