package com.chitfund.notificationservice.template;

import com.chitfund.notificationservice.domain.enums.NotificationEventType;
import lombok.Getter;

import java.util.Map;

/**
 * WHY enum-based templates?
 * - Single source of truth for message wording — change in one place, affects all sends
 * - Compile-time safety: can't reference a non-existent template
 * - Each template documents exactly which {params} it expects
 *
 * In production you'd move these to a DB or CMS so non-engineers can edit message copy.
 * For now, enum is fast and type-safe — the right call at this stage.
 *
 * Placeholder format: {paramName} — replaced at runtime with actual values.
 */
@Getter
public enum NotificationTemplate {

    PAYMENT_DUE(
        // Params: chitName, monthNumber, amount, dueDate
        "Your installment of Rs.{amount} is due for chit '{chitName}' (Draw {monthNumber}). " +
        "Due date: {dueDate}. Please pay on time to avoid penalties."
    ),

    PAYMENT_RECEIVED(
        // Params: amount, chitName, monthNumber, remainingBalance
        "Payment of Rs.{amount} received for chit '{chitName}' Draw {monthNumber}. " +
        "{remainingBalance}"
    ),

    MONTH_SKIPPED(
        // Params: chitName, monthNumber, reason
        "Update: Chit '{chitName}' Draw {monthNumber} has been skipped. " +
        "Reason: {reason}. Your chit continues with an extended end date. No payment required for this draw."
    ),

    WINNER_SELECTED(
        // Params: chitName, monthNumber, amount
        "Congratulations! You have won chit '{chitName}' for Draw {monthNumber}. " +
        "Payout amount: Rs.{amount}. Admin will contact you soon for disbursement."
    ),

    PAYOUT_DISBURSED(
        // Params: amount, chitName, mode, reference
        "Your payout of Rs.{amount} for chit '{chitName}' has been sent via {mode}. " +
        "Reference: {reference}. Please check your account within 1-2 business days."
    ),

    CASH_COLLECTED(
        // Params: workerName, memberName, amount, chitName
        "Alert: {workerName} collected Rs.{amount} cash from {memberName} for chit '{chitName}'. " +
        "Please collect and remit at day end."
    ),

    PROFILE_UPDATED(
        // Params: fieldChanged, newValue
        "Your profile has been updated by an admin. {fieldChanged} is now set to: {newValue}."
    ),

    AUCTION_OUTBID(
        // Params: bidAmount, chitName, drawNumber
        "You've been outbid in chit '{chitName}' Draw {drawNumber}! " +
        "Someone placed a lower bid of Rs.{bidAmount}. Open the auction room to place a new bid."
    ),

    AUCTION_WINNING(
        // Params: bidAmount, chitName, drawNumber
        "You're leading in chit '{chitName}' Draw {drawNumber}! " +
        "Your bid of Rs.{bidAmount} is currently the lowest. Stay alert."
    ),

    AUCTION_WON(
        // Params: chitName, drawNumber, amount
        "Congratulations! You won the auction for chit '{chitName}' Draw {drawNumber} at Rs.{amount}. " +
        "Your payout will be processed shortly."
    ),

    AUCTION_LOST(
        // Params: chitName, drawNumber
        "Auction closed for chit '{chitName}' Draw {drawNumber}. " +
        "Better luck next draw!"
    );

    private final String template;

    NotificationTemplate(String template) {
        this.template = template;
    }

    public String format(Map<String, String> params) {
        String result = template;
        for (Map.Entry<String, String> entry : params.entrySet()) {
            result = result.replace("{" + entry.getKey() + "}", entry.getValue());
        }
        return result;
    }

    public static NotificationTemplate forEventType(NotificationEventType eventType) {
        return switch (eventType) {
            case PAYMENT_DUE      -> PAYMENT_DUE;
            case PAYMENT_RECEIVED -> PAYMENT_RECEIVED;
            case MONTH_SKIPPED    -> MONTH_SKIPPED;
            case WINNER_SELECTED  -> WINNER_SELECTED;
            case PAYOUT_DISBURSED -> PAYOUT_DISBURSED;
            case CASH_COLLECTED   -> CASH_COLLECTED;
            case PROFILE_UPDATED  -> PROFILE_UPDATED;
            case AUCTION_OUTBID   -> AUCTION_OUTBID;
            case AUCTION_WINNING  -> AUCTION_WINNING;
            case AUCTION_WON      -> AUCTION_WON;
            case AUCTION_LOST     -> AUCTION_LOST;
        };
    }
}
