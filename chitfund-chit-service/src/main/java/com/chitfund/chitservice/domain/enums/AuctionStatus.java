package com.chitfund.chitservice.domain.enums;

public enum AuctionStatus {
    OPEN,    // Auction is live; members can place bids
    CLOSED,  // Auction ended; winner assigned; payment records created
    VOIDED   // Admin voided — winner/payments reversed; a new auction can be opened for the same month
}
