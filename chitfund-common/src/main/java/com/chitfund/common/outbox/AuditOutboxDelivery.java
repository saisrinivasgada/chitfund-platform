package com.chitfund.common.outbox;

public record AuditOutboxDelivery(
        String deliveryId,
        String eventId,
        String destination,
        String payload,
        int attempts,
        String leaseToken
) {}
