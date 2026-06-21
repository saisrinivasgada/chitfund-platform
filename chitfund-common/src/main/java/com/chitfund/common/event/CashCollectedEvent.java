package com.chitfund.common.event;

import java.math.BigDecimal;
import java.time.Instant;

/**
 * Published when a worker records cash collection from a member.
 * Triggers an alert so the admin knows cash is in the field awaiting remittance.
 */
public record CashCollectedEvent(
        String batchId,
        String chitId,
        String memberId,
        BigDecimal amount,
        String collectedByUserId,
        Instant occurredAt
) {}
