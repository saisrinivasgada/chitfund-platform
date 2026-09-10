package com.chitfund.common.event;

/**
 * Envelope that wraps any domain event published to a consolidated SQS queue.
 * eventType is a short string constant (e.g. "CASH_COLLECTED") that consumers
 * use to route to the correct handler without needing a separate queue per event.
 */
public record SqsEventEnvelope(String eventId, String eventType, String payload) {

    /** Backward-compatible constructor for publishers not yet using an outbox. */
    public SqsEventEnvelope(String eventType, String payload) {
        this(null, eventType, payload);
    }
}
