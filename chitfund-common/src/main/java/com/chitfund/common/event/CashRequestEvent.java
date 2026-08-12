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
        String tenantId,
        String requestId,
        String eventType,      // CREATED | ASSIGNED | PICKED_UP | COLLECTED | PARTIALLY_COLLECTED | MEMBER_APPROVED | MEMBER_REJECTED
        String memberId,       // member profile UUID (for metadata/audit)
        String memberUserId,   // user account UUID — recipient for member in-app notification
        String staffId,        // user account UUID — recipient for staff in-app notification
        BigDecimal amount,
        String memberName,
        String staffName,
        Instant occurredAt,
        BigDecimal collectedAmount,  // set for PARTIALLY_COLLECTED, MEMBER_APPROVED, MEMBER_REJECTED
        String extraData             // rejection reason for MEMBER_REJECTED; null otherwise
) {}
