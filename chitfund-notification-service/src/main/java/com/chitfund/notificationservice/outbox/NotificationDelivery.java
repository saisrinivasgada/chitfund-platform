package com.chitfund.notificationservice.outbox;

public record NotificationDelivery(
        String deliveryId,
        String eventId,
        String tenantId,
        String notificationId,
        String deliveryType,
        String payload,
        int attempts,
        String leaseToken
) { }
