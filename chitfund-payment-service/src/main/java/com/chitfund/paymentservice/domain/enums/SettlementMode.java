package com.chitfund.paymentservice.domain.enums;

/**
 * Only applicable to CASE_C (partial payout).
 *
 * FAIR      — Nets undisbursed fund credit against what the member owes. Honest accounting.
 * ADMIN_WIN — Anchors to disbursedAmount; member must cover what they received minus installments paid back.
 *             Forgives the undisbursed remainder on member exit. Simpler for the fund.
 */
public enum SettlementMode {
    FAIR,
    ADMIN_WIN
}
