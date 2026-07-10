package com.chitfund.common.event;

/**
 * WHY centralize topic names in common?
 * Publisher and consumer must use the exact same string.
 * If they're defined separately, a typo = silent data loss (no error, just no messages).
 * Keeping them here makes a topic name change a compile-time change, not a grep-and-pray.
 *
 * Naming convention: {domain}.{entity}.{past-tense-verb}
 * - Domain prefix prevents collisions if this Kafka cluster is shared with other apps.
 * - Past tense ("opened", not "open") — events describe facts that happened, not commands.
 */
public final class KafkaTopics {

    private KafkaTopics() {}

    // payment-service publishes
    public static final String MONTH_OPENED     = "chitfund.payment.month-opened";
    public static final String MONTH_SKIPPED    = "chitfund.payment.month-skipped";
    public static final String CASH_COLLECTED   = "chitfund.payment.cash-collected";
    public static final String PAYMENT_COMPLETED = "chitfund.payment.batch-completed";

    // payout-service publishes
    public static final String PAYOUT_CREATED   = "chitfund.payout.created";
    public static final String PAYOUT_DISBURSED = "chitfund.payout.disbursed";

    // chit-service publishes (org-held slot lifecycle)
    public static final String ORG_RESERVATION_CREATED = "chitfund.chit.org-reservation-created";
    public static final String ORG_PAYOUT_REALIZED     = "chitfund.chit.org-payout-realized";
}
