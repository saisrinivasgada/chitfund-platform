package com.chitfund.common.event;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

/**
 * Published by payment-service when admin skips a month.
 * All members and workers need to be notified; chit-service needs to extend the end date.
 */
public record ChitMonthSkippedEvent(
        String tenantId,
        String chitId,
        String chitName,
        Integer monthNumber,
        LocalDate dueDate,
        BigDecimal installmentAmount,
        Integer totalMembers,
        List<String> memberIds,
        String skipReason,
        String skippedBy,
        String actorRole,
        Instant occurredAt
) {}
