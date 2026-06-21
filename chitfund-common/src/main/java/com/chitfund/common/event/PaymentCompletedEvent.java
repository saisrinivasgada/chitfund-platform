package com.chitfund.common.event;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;

/**
 * Published when a payment batch reaches COMPLETED status (non-cash immediately;
 * cash after admin remittance). FIFO has been applied — payment_records are updated.
 *
 * WHY include member summary totals (totalDue, totalPaid...)?
 * This is the "fat event" pattern. reporting-service needs these totals to update
 * its member_payment_summaries table. Without them, reporting-service would have to
 * call payment-service synchronously — defeating the purpose of decoupling.
 * payment-service computes them right after FIFO, when the data is fresh in the
 * same transaction, and embeds them in the event.
 */
public record PaymentCompletedEvent(
        String batchId,
        String chitId,
        String memberId,
        BigDecimal amount,
        String paymentMode,
        // Summary totals for reporting-service (computed from DB after FIFO)
        BigDecimal totalDue,
        BigDecimal totalPaid,
        BigDecimal totalOutstanding,
        Integer monthsSettled,
        Integer monthsPartiallyPaid,
        Integer monthsOutstanding,
        Integer monthsWaived,
        LocalDate lastPaymentDate,
        String completedByUserId,
        Instant occurredAt
) {}
