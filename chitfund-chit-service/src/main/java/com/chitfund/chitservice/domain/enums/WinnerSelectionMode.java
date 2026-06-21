package com.chitfund.chitservice.domain.enums;

/**
 * How the monthly winner is chosen — drives the Strategy pattern.
 *
 * LOTTERY:     Random draw from members who haven't won yet.
 *              Service picks the winner automatically.
 *
 * AUCTION:     Members bid; the one who accepts the lowest payout wins.
 *              Example: Pot = ₹20,000. Member bids to take ₹17,000 (discount = ₹3,000).
 *              The discount is distributed to all members as a dividend.
 *              Manager provides the winnerId + discountAmount in the API call.
 *
 * RESERVATION: Member pre-reserves a specific month.
 *              First-come, first-served. Uses optimistic locking to prevent
 *              two members from reserving the same month simultaneously.
 *
 * INTERVIEW: "This is the Strategy pattern. The WinnerSelectionMode determines
 * which WinnerSelectionStrategy implementation is used at runtime.
 * Adding a new mode (e.g., BIDDING_PLATFORM) only requires:
 * 1. Adding the enum value
 * 2. Writing a new Strategy class
 * Zero changes to existing code — Open/Closed Principle."
 */
public enum WinnerSelectionMode {
    LOTTERY,
    AUCTION,
    RESERVATION
}
