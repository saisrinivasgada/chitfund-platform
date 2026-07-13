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
    public static final String PAYOUT_CREATED          = "chitfund-payout-created";
    public static final String PAYOUT_DISBURSED        = "chitfund-payout-disbursed";

    // chit-service publishes
    public static final String ORG_RESERVATION_CREATED = "chitfund-org-reservation-created";
    public static final String ORG_PAYOUT_REALIZED     = "chitfund-org-payout-realized";

    // member-service publishes
    public static final String MEMBER_UPDATED          = "chitfund-member-updated";

    // payment-service publishes (cash request lifecycle)
    public static final String CASH_REQUEST_EVENT      = "chitfund-cash-request-event";
}
