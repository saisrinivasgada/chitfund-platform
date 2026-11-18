package com.chitfund.paymentservice.dto.response;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

/** An immutable, non-posting review of how a payment would clear current dues. */
public record PaymentPreviewResponse(
        UUID memberId,
        UUID primaryChitId,
        BigDecimal requestedAmount,
        String balanceVersion,
        BigDecimal creditAvailable,
        BigDecimal creditConsumed,
        BigDecimal totalOutstanding,
        BigDecimal selectedChitOutstanding,
        BigDecimal projectedNewCredit,
        List<AllocationLine> allocations) {

    public record AllocationLine(
            UUID chitId,
            int monthNumber,
            boolean catchUpLine,
            BigDecimal creditApplied,
            BigDecimal newPaymentApplied) { }
}
