package com.chitfund.reportingservice.dto.ingest;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * Payload pushed by payment-service whenever a chit month's payment status changes.
 * This is a full replacement snapshot — not a delta — so the receiver just upserts it.
 *
 * WHY full snapshot instead of delta?
 * Deltas require ordering guarantees (what if events arrive out of order?).
 * A full snapshot is idempotent: applying it twice is safe.
 */
public record CollectionSnapshotEvent(
        @NotBlank String chitId,
        String chitName,
        @NotNull Integer monthNumber,
        @NotNull LocalDate dueDate,
        @NotNull BigDecimal installmentAmount,
        @NotNull Integer capacity,
        @NotNull Integer settledCount,
        @NotNull Integer partiallyPaidCount,
        @NotNull Integer outstandingCount,
        @NotNull Integer waivedCount,
        @NotNull BigDecimal totalCollected,
        @NotNull BigDecimal totalOutstanding,
        @NotBlank String cycleStatus,
        String skipReason,
        String tenantId
) {}
