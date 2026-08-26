package com.chitfund.chitservice.domain.enums;

public enum AuctionMode {
    ONLINE,   // Members bid live through the app; WebSocket auction room
    OFFLINE   // Bidding happens in person; admin records winner + won amount manually
}
