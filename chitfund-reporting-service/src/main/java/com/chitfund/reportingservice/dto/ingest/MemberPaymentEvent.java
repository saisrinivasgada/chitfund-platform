package com.chitfund.reportingservice.dto.ingest;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * Pushed by payment-service when a payment batch is remitted (FIFO allocations confirmed).
 * Full summary replacement for the member+chit combination.
 */
public record MemberPaymentEvent(
        @NotBlank String memberId,
        @NotBlank String chitId,
        String memberName,
        String memberPhone,
        @NotNull BigDecimal totalDue,
        @NotNull BigDecimal totalPaid,
        @NotNull BigDecimal totalOutstanding,
        @NotNull Integer monthsSettled,
        @NotNull Integer monthsPartiallyPaid,
        @NotNull Integer monthsOutstanding,
        @NotNull Integer monthsWaived,
        LocalDate lastPaymentDate,
        BigDecimal lastPaymentAmount,
        String tenantId
) {}
