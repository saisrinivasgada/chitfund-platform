package com.chitfund.reportingservice.dto.response;

import com.chitfund.reportingservice.domain.PayoutSummary;

import java.math.BigDecimal;
import java.time.LocalDate;

public record PayoutSummaryReport(
        String chitId,
        String memberId,
        String memberName,
        Integer monthNumber,
        BigDecimal winningAmount,
        BigDecimal discountAmount,
        BigDecimal netPayoutAmount,
        String status,
        String disbursementMode,
        LocalDate disbursedAt
) {
    public static PayoutSummaryReport from(PayoutSummary s) {
        return new PayoutSummaryReport(
                s.getChitId(), s.getMemberId(), s.getMemberName(), s.getMonthNumber(),
                s.getWinningAmount(), s.getDiscountAmount(), s.getNetPayoutAmount(),
                s.getStatus(), s.getDisbursementMode(), s.getDisbursedAt()
        );
    }
}
