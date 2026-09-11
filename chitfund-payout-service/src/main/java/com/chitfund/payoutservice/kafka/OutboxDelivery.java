package com.chitfund.payoutservice.kafka;

public record OutboxDelivery(
        String deliveryId,
        String eventId,
        String eventType,
        String destination,
        String payload,
        int attempts,
        String leaseToken
) {}
