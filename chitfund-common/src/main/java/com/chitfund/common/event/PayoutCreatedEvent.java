package com.chitfund.common.event;

import java.math.BigDecimal;
import java.time.Instant;

/**
 * Published by payout-service when admin registers a payout obligation for the winner.
 * notification-service uses this to send the "you won!" message.
 */
public record PayoutCreatedEvent(
        String payoutId,
        String chitId,
        String memberId,
        Integer monthNumber,
        BigDecimal winningAmount,
        BigDecimal discountAmount,
        BigDecimal netPayoutAmount,
        String createdBy,
        Instant occurredAt,
        String tenantId
) {}
