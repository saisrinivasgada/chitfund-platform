package com.chitfund.payoutservice.domain.enums;

public enum PayoutStatus {
    PENDING,             // winner announced, funds not yet disbursed
    PARTIALLY_DISBURSED, // partial amount sent — remaining still owed to winner
    DISBURSED,           // full amount transferred to the winner
    CANCELLED,           // payout cancelled (only allowed on PENDING, not partially disbursed)
    VOIDED               // disbursement reversed — admin can create a new payout for this draw
}
