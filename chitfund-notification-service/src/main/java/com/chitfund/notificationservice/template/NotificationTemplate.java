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
        "Your installment of Rs.{amount} is due for chit '{chitName}' (Month {monthNumber}). " +
        "Due date: {dueDate}. Please pay on time to avoid penalties."
    ),

    PAYMENT_RECEIVED(
        // Params: amount, chitName, monthNumber, remainingBalance
        "Payment of Rs.{amount} received for chit '{chitName}' Month {monthNumber}. " +
        "{remainingBalance}"
    ),

    MONTH_SKIPPED(
        // Params: chitName, monthNumber, reason
        "Update: Chit '{chitName}' Month {monthNumber} has been skipped. " +
        "Reason: {reason}. Your chit continues with an extended end date. No payment required this month."
    ),

    WINNER_SELECTED(
        // Params: chitName, monthNumber, amount
        "Congratulations! You have won chit '{chitName}' for Month {monthNumber}. " +
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
        };
    }
}
