package com.chitfund.reportingservice.dto.ingest;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * Pushed by payout-service on any status change (creation, disbursement, cancellation).
 * Full replacement snapshot for the chit+month combination.
 */
public record PayoutEvent(
        @NotBlank String chitId,
        @NotBlank String memberId,
        String memberName,
        @NotNull Integer monthNumber,
        @NotNull BigDecimal winningAmount,
        @NotNull BigDecimal discountAmount,
        @NotNull BigDecimal netPayoutAmount,
        @NotBlank String status,
        String disbursementMode,
        LocalDate disbursedAt,
        String tenantId
) {}
