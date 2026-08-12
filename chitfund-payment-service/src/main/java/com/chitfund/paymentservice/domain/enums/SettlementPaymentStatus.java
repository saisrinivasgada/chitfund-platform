package com.chitfund.paymentservice.domain.enums;

/**
 * Tracks payment collection / disbursement progress for a confirmed settlement.
 *
 * WHY a separate status from SettlementCase?
 * SettlementCase describes the financial scenario (A/B1/B2/C).
 * SettlementPaymentStatus tracks how much of the net obligation has actually moved —
 * cash in / cash out. This lets admins confirm a settlement first, then record
 * individual payment transactions over time until the net is fully settled.
 */
public enum SettlementPaymentStatus {

    /** Settlement confirmed, no money has moved yet. */
    PENDING,

    /** netAmount > 0 and some (but not all) has been collected from the member. */
    PARTIALLY_COLLECTED,

    /** netAmount > 0 and the full amount has been collected from the member. */
    FULLY_COLLECTED,

    /** netAmount < 0 and some (but not all) of the refund has been disbursed to the member. */
    PARTIALLY_DISBURSED,

    /** netAmount < 0 and the full refund has been disbursed to the member. */
    FULLY_DISBURSED,

    /** netAmount == 0 — nothing to collect or disburse; accounts are balanced. */
    BALANCED,

    /** Settlement was voided by an admin — all associated payment records reverted to OUTSTANDING. */
    VOIDED
}
