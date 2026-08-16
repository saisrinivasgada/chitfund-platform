package com.chitfund.common.event;

/**
 * SQS queue names and event type constants shared by all services.
 *
 * Architecture: two consolidated queues (one per consumer service) instead of
 * one queue per event type. This keeps total polling threads at 2, which stays
 * well within the SQS free-tier limit of 1 million requests/month.
 * (2 queues × 3 polls/min × 60 × 24 × 30 ≈ 260K requests/month vs the old
 * 10 queues × 6 polls/min ≈ 2.6M requests/month.)
 *
 * Publishers send the event wrapped in SqsEventEnvelope to every queue whose
 * consumer needs to see that event. Consumers route by eventType string.
 */
public final class SqsQueues {

    private SqsQueues() {}

    // ── Consolidated consumer queues (one per service) ───────────────────────────
    public static final String NOTIFICATION_EVENTS = "chitfund-notification-events";
    public static final String AUDIT_EVENTS        = "chitfund-audit-events";

    // ── Event type constants used inside SqsEventEnvelope.eventType ─────────────
    public static final String EVT_MONTH_OPENED            = "MONTH_OPENED";
    public static final String EVT_MONTH_SKIPPED           = "MONTH_SKIPPED";
    public static final String EVT_CASH_COLLECTED          = "CASH_COLLECTED";
    public static final String EVT_PAYMENT_COMPLETED       = "PAYMENT_COMPLETED";
    public static final String EVT_PAYOUT_CREATED          = "PAYOUT_CREATED";
    public static final String EVT_PAYOUT_DISBURSED        = "PAYOUT_DISBURSED";
    public static final String EVT_MEMBER_UPDATED          = "MEMBER_UPDATED";
    public static final String EVT_CASH_REQUEST_EVENT      = "CASH_REQUEST_EVENT";
    public static final String EVT_ORG_RESERVATION_CREATED = "ORG_RESERVATION_CREATED";
    public static final String EVT_ORG_PAYOUT_REALIZED     = "ORG_PAYOUT_REALIZED";
}
