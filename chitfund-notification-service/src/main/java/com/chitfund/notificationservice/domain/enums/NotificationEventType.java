package com.chitfund.notificationservice.domain.enums;

public enum NotificationEventType {
    PAYMENT_DUE,          // month opened — member owes installment
    PAYMENT_RECEIVED,     // member's payment was recorded (batch COMPLETED)
    MONTH_SKIPPED,        // admin skipped a month — all members + workers notified
    WINNER_SELECTED,      // winner announced — notify the winner
    PAYOUT_DISBURSED,     // money transferred to winner — send receipt
    CASH_COLLECTED,       // worker collected cash — alert admin to remit
    PROFILE_UPDATED,      // admin updated a member's profile field
    AUCTION_OUTBID,       // member's leading bid was overtaken by a lower bid
    AUCTION_WINNING,      // member just placed a bid and is currently leading
    AUCTION_WON,          // auction closed and this member won
    AUCTION_LOST          // auction closed and this member bid but did not win
}
