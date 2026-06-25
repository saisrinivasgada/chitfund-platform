package com.chitfund.paymentservice.domain.enums;

/**
 * Direction of a settlement payment transaction relative to the fund treasury.
 *
 * WHY an enum instead of a boolean?
 * "From whose perspective is this money moving?" — an enum communicates intent clearly
 * and is safe to add more directions later (e.g. REVERSAL) without schema changes.
 */
public enum TransactionDirection {

    /** Member → Fund: money collected from the member (netAmount > 0 settlements). */
    COLLECTION,

    /** Fund → Member: money disbursed to the member (netAmount < 0 settlements). */
    DISBURSEMENT
}
