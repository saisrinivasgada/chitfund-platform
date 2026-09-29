package com.chitfund.common.outbox;

public record EventOutboxDelivery(
        String deliveryId,
        String eventId,
        String eventType,
        String destination,
        String payload,
        int attempts,
        String leaseToken
) {}
