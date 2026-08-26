package com.chitfund.paymentservice.domain.enums;

public enum DrawStatus {
    AWAITING_AUCTION, // draw opened for AUCTION chit; no payment records yet; waiting for auction to close
    OPEN,             // payment records created; collection period active
    CLOSED,           // admin explicitly closed this month; collection period is over
    SKIPPED           // admin skipped this month; waived records created; chit end-date extends
}
