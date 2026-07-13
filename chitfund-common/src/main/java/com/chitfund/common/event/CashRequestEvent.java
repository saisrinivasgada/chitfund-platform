package com.chitfund.common.event;

import java.math.BigDecimal;
import java.time.Instant;

/**
 * Published by payment-service for every cash request lifecycle transition.
 * notification-service consumes this to create in-app notifications for
 * the member (via memberUserId) and the assigned worker (via workerId).
 *
 * memberUserId and workerId are already user account UUIDs — no resolution needed
 * in the consumer.
 */
public record CashRequestEvent(
        String requestId,
        String eventType,      // CREATED | ASSIGNED | PICKED_UP | COLLECTED
        String memberId,       // member profile UUID (for metadata/audit)
        String memberUserId,   // user account UUID — recipient for member in-app notification
        String workerId,       // user account UUID — recipient for worker in-app notification
        BigDecimal amount,
        String memberName,
        String workerName,
        Instant occurredAt
) {}
