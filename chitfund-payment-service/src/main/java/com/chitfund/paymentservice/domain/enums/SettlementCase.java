package com.chitfund.paymentservice.domain.enums;

/**
 * Which settlement formula applies to a chit-member pair.
 *
 * CASE_A  — Payout DISBURSED. Member owes remaining future installments.
 * CASE_B1 — No payout, has a RESERVED MonthReservation slot. Fund refunds (payout - future dues).
 * CASE_B2 — No payout, no slot at all. Fund refunds everything paid in.
 * CASE_C  — Payout PARTIALLY_DISBURSED. Two modes: FAIR or ADMIN_WIN.
 */
public enum SettlementCase {
    CASE_A,
    CASE_B1,
    CASE_B2,
    CASE_C
}
