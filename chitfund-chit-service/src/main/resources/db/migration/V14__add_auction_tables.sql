-- Add auction_mode to chits table
ALTER TABLE chits
    ADD COLUMN auction_mode VARCHAR(10) NULL
        COMMENT 'ONLINE or OFFLINE; only set when winner_selection_mode = AUCTION';

-- Auction sessions: one per chit per month (for AUCTION-type chits)
CREATE TABLE auction_sessions (
    id                      VARCHAR(36)    NOT NULL PRIMARY KEY,
    tenant_id               VARCHAR(36)    NOT NULL,
    chit_id                 VARCHAR(36)    NOT NULL,
    month_number            INT            NOT NULL,
    scheduled_payout_amount DECIMAL(15,2)  NOT NULL COMMENT 'Max prize for this month',
    auction_mode            VARCHAR(10)    NOT NULL,
    status                  VARCHAR(10)    NOT NULL DEFAULT 'OPEN',
    winner_id               VARCHAR(36)    NULL,
    won_amount              DECIMAL(15,2)  NULL,
    discount_amount         DECIMAL(15,2)  NULL,
    dividend_per_spot       DECIMAL(15,2)  NULL,
    opened_by               VARCHAR(36)    NULL,
    closed_by               VARCHAR(36)    NULL,
    opened_at               DATETIME       NULL,
    closed_at               DATETIME       NULL,
    created_at              DATETIME       NOT NULL,
    updated_at              DATETIME       NOT NULL,
    UNIQUE KEY uq_auction_chit_month (chit_id, month_number),
    INDEX idx_auction_chit    (chit_id),
    INDEX idx_auction_tenant  (tenant_id)
);

-- Auction bids: each bid a member places in an auction session
CREATE TABLE auction_bids (
    id                 VARCHAR(36)   NOT NULL PRIMARY KEY,
    auction_session_id VARCHAR(36)   NOT NULL,
    chit_id            VARCHAR(36)   NOT NULL,
    member_id          VARCHAR(36)   NOT NULL,
    bid_amount         DECIMAL(15,2) NOT NULL COMMENT 'Payout amount member is willing to accept',
    discount_offered   DECIMAL(15,2) NOT NULL COMMENT 'scheduled_payout - bid_amount',
    bid_time           DATETIME      NOT NULL,
    INDEX idx_bid_session  (auction_session_id),
    INDEX idx_bid_member   (member_id),
    INDEX idx_bid_chit     (chit_id)
);
