package com.chitfund.paymentservice.domain.enums;

public enum PaymentRecordStatus {
    OUTSTANDING,        // nothing paid yet
    PARTIALLY_PAID,     // some cash paid, balance still remaining
    SETTLED,            // fully paid — amount_paid == amount_due
    WAIVED,             // month was skipped; no payment required; amount_due shows what was forgiven
    PAYOUT_DEDUCTED,    // installment/dues withheld from winner's payout — no cash received; amountPaid == amountDue
    SETTLEMENT_CLEARED, // wiped out as part of a member exit settlement — no further collection
    CREDIT_COVERED,     // fully covered by member credit balance at draw open — no cash required
    PARTIAL_CREDIT;     // partially covered by credit balance at draw open — amountPaid = credit applied, remainder still owed

    public static java.util.List<PaymentRecordStatus> outstandingStatuses() {
        return java.util.List.of(OUTSTANDING, PARTIALLY_PAID, PARTIAL_CREDIT);
    }

    public boolean hasOutstandingBalance() {
        return this == OUTSTANDING || this == PARTIALLY_PAID || this == PARTIAL_CREDIT;
    }
}
