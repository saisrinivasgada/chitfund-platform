package com.chitfund.common.event;

import java.math.BigDecimal;
import java.time.Instant;

/**
 * Published by payout-service when the money is physically transferred to the winner.
 * notification-service sends the disbursement receipt; reporting-service marks the payout DISBURSED.
 */
public record PayoutDisbursedEvent(
        String payoutId,
        String chitId,
        String memberId,
        Integer monthNumber,
        BigDecimal netPayoutAmount,
        String disbursementMode,
        String referenceNumber,
        String disbursedBy,
        Instant occurredAt,
        String tenantId
) {}
