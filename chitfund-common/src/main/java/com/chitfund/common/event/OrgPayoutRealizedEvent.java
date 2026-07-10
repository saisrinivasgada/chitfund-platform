package com.chitfund.common.event;

import java.math.BigDecimal;
import java.time.Instant;

/**
 * Published by chit-service when admin realizes the org-held slot payout to treasury.
 */
public record OrgPayoutRealizedEvent(
        String reservationId,
        String chitId,
        Integer monthNumber,
        BigDecimal payoutAmount,
        String realizedBy,
        Instant occurredAt
) {}
