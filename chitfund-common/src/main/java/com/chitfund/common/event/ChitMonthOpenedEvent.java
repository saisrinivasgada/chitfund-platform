package com.chitfund.common.event;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

/**
 * Published by payment-service when admin opens a new monthly cycle.
 *
 * WHY include memberIds but not phones?
 * payment-service only knows UUIDs — it doesn't store member contact info.
 * notification-service handles the "no phone" case gracefully (SKIPPED status).
 * When Kafka is fully wired with member-service events, notification-service
 * will have a local phone cache and won't need to call anyone.
 */
public record ChitMonthOpenedEvent(
        String chitId,
        String chitName,
        Integer monthNumber,
        LocalDate dueDate,
        BigDecimal installmentAmount,
        Integer totalMembers,
        List<String> memberIds,
        String openedBy,
        String actorRole,
        Instant occurredAt
) {}
