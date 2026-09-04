package com.chitfund.reportingservice.dto.response;

import com.chitfund.reportingservice.domain.MonthlyCollectionSnapshot;

import java.math.BigDecimal;
import java.time.LocalDate;

public record ChitCollectionReport(
        String chitId,
        String chitName,
        Integer monthNumber,
        LocalDate dueDate,
        BigDecimal installmentAmount,
        Integer capacity,
        Integer settledCount,
        Integer partiallyPaidCount,
        Integer outstandingCount,
        Integer waivedCount,
        BigDecimal totalCollected,
        BigDecimal totalOutstanding,
        String cycleStatus,
        String skipReason,
        Double collectionPercentage
) {
    public static ChitCollectionReport from(MonthlyCollectionSnapshot s) {
        double pct = s.getCapacity() == 0 ? 0.0
                : s.getSettledCount() * 100.0 / s.getCapacity();
        return new ChitCollectionReport(
                s.getChitId(), s.getChitName(), s.getMonthNumber(), s.getDueDate(),
                s.getInstallmentAmount(), s.getCapacity(), s.getSettledCount(),
                s.getPartiallyPaidCount(), s.getOutstandingCount(), s.getWaivedCount(),
                s.getTotalCollected(), s.getTotalOutstanding(), s.getCycleStatus(),
                s.getSkipReason(), Math.round(pct * 10.0) / 10.0
        );
    }
}
