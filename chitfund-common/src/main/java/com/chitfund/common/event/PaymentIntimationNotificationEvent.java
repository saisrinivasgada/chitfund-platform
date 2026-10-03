package com.chitfund.common.event;

import java.math.BigDecimal;

/**
 * Published when a member submits or admin rejects a payment intimation.
 * eventSubType: "SUBMITTED" (admin alert) or "REJECTED" (member alert).
 * Approval notifications are handled by PaymentCompletedEvent from recordPayment().
 */
public record PaymentIntimationNotificationEvent(
        String intimationId,
        String memberId,
        String memberName,
        BigDecimal totalAmount,
        String eventSubType,
        String rejectReason,
        String tenantId
) {}
