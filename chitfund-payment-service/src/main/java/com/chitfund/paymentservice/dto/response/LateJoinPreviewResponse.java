package com.chitfund.paymentservice.dto.response;

import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

@Data
@Builder
public class LateJoinPreviewResponse {

    private UUID chitId;
    private UUID memberId;
    private String chitName;
    private String winnerSelectionMode;

    private List<CatchUpInstallmentItem> catchUpInstallments;

    private BigDecimal existingCreditBalance;
    private BigDecimal totalCatchUpAmount;
    private BigDecimal creditApplicable;
    private BigDecimal netCashRequired;

    /** Number of catch-up months already posted (> 0 means partial previous late-join run). */
    private int alreadyPostedMonths;

    @Data
    @Builder
    public static class CatchUpInstallmentItem {
        private int monthNumber;
        private LocalDate dueDate;
        private BigDecimal grossAmount;
        /** null for RESERVATION / LOTTERY draws */
        private BigDecimal dividendDeductedAmount;
        private BigDecimal amountDue;
        /** OPEN | CLOSED | AWAITING_AUCTION */
        private String drawStatus;
        /** true if a PaymentRecord already exists — means a previous run partially posted */
        private boolean alreadyPosted;
    }
}
