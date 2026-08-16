package com.chitfund.common.event;

/**
 * Envelope that wraps any domain event published to a consolidated SQS queue.
 * eventType is a short string constant (e.g. "CASH_COLLECTED") that consumers
 * use to route to the correct handler without needing a separate queue per event.
 */
public record SqsEventEnvelope(String eventType, String payload) {}
