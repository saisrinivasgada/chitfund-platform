package com.chitfund.common.event;

import java.math.BigDecimal;
import java.time.Instant;

/**
 * Published by chit-service when admin creates an org-held payout slot.
 */
public record OrgReservationCreatedEvent(
        String reservationId,
        String chitId,
        Integer monthNumber,
        BigDecimal payoutAmount,
        String createdBy,
        Instant occurredAt
) {}
