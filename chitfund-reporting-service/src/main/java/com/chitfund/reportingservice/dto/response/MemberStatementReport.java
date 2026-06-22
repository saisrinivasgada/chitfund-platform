package com.chitfund.reportingservice.dto.response;

import com.chitfund.reportingservice.domain.MemberPaymentSummary;

import java.math.BigDecimal;
import java.time.LocalDate;

public record MemberStatementReport(
        String memberId,
        String chitId,
        String memberName,
        String memberPhone,
        BigDecimal totalDue,
        BigDecimal totalPaid,
        BigDecimal totalOutstanding,
        Integer monthsSettled,
        Integer monthsPartiallyPaid,
        Integer monthsOutstanding,
        Integer monthsWaived,
        LocalDate lastPaymentDate,
        BigDecimal lastPaymentAmount
) {
    public static MemberStatementReport from(MemberPaymentSummary s) {
        return new MemberStatementReport(
                s.getMemberId(), s.getChitId(), s.getMemberName(), s.getMemberPhone(),
                s.getTotalDue(), s.getTotalPaid(), s.getTotalOutstanding(),
                s.getMonthsSettled(), s.getMonthsPartiallyPaid(),
                s.getMonthsOutstanding(), s.getMonthsWaived(),
                s.getLastPaymentDate(), s.getLastPaymentAmount()
        );
    }
}
