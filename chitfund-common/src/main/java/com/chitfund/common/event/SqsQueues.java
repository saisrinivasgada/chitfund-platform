package com.chitfund.common.event;

/**
 * SQS queue names shared by all services.
 * Publisher and consumer must use the exact same string — centralising here
 * makes a rename a compile-time change instead of a grep-and-pray.
 *
 * In AWS these names match the actual SQS queues created via Terraform.
 * Locally the publisher just logs a warning if SQS is unreachable — no crash.
 */
public final class SqsQueues {

    private SqsQueues() {}

    // payment-service publishes
    public static final String MONTH_OPENED      = "chitfund-month-opened";
    public static final String MONTH_SKIPPED     = "chitfund-month-skipped";
    public static final String CASH_COLLECTED    = "chitfund-cash-collected";
    public static final String PAYMENT_COMPLETED = "chitfund-payment-completed";

    // payout-service publishes
    public static final String PAYOUT_CREATED    = "chitfund-payout-created";
    public static final String PAYOUT_DISBURSED  = "chitfund-payout-disbursed";
}
