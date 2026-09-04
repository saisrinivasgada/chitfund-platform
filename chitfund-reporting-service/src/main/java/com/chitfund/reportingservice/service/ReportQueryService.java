package com.chitfund.reportingservice.service;

import com.chitfund.common.context.TenantContext;
import com.chitfund.common.exception.BusinessException;
import com.chitfund.common.exception.ErrorCode;
import com.chitfund.reportingservice.dto.response.ChitCollectionReport;
import com.chitfund.reportingservice.dto.response.MemberStatementReport;
import com.chitfund.reportingservice.dto.response.PayoutSummaryReport;
import com.chitfund.reportingservice.repository.MemberPaymentSummaryRepository;
import com.chitfund.reportingservice.repository.MonthlyCollectionSnapshotRepository;
import com.chitfund.reportingservice.repository.PayoutSummaryRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@RequiredArgsConstructor
public class ReportQueryService {

    private final MonthlyCollectionSnapshotRepository snapshotRepository;
    private final MemberPaymentSummaryRepository memberSummaryRepository;
    private final PayoutSummaryRepository payoutSummaryRepository;

    @Transactional(readOnly = true)
    public List<ChitCollectionReport> getChitCollectionReport(String chitId) {
        return snapshotRepository.findByTenantIdAndChitIdOrderByMonthNumberAsc(TenantContext.get(), chitId)
                .stream()
                .map(ChitCollectionReport::from)
                .toList();
    }

    @Transactional(readOnly = true)
    public ChitCollectionReport getMonthSnapshot(String chitId, Integer monthNumber) {
        return snapshotRepository.findByTenantIdAndChitIdAndMonthNumber(TenantContext.get(), chitId, monthNumber)
                .map(ChitCollectionReport::from)
                .orElseThrow(() -> new BusinessException(
                        ErrorCode.RESOURCE_NOT_FOUND,
                        "No snapshot found for chit " + chitId + " month " + monthNumber,
                        HttpStatus.NOT_FOUND));
    }

    @Transactional(readOnly = true)
    public List<MemberStatementReport> getChitMemberStatements(String chitId) {
        return memberSummaryRepository.findByTenantIdAndChitIdOrderByMemberNameAsc(TenantContext.get(), chitId)
                .stream()
                .map(MemberStatementReport::from)
                .toList();
    }

    @Transactional(readOnly = true)
    public List<MemberStatementReport> getMemberStatement(String memberId) {
        return memberSummaryRepository.findByTenantIdAndMemberIdOrderByChitIdAsc(TenantContext.get(), memberId)
                .stream()
                .map(MemberStatementReport::from)
                .toList();
    }

    @Transactional(readOnly = true)
    public List<PayoutSummaryReport> getChitPayouts(String chitId) {
        return payoutSummaryRepository.findByTenantIdAndChitIdOrderByMonthNumberAsc(TenantContext.get(), chitId)
                .stream()
                .map(PayoutSummaryReport::from)
                .toList();
    }

    @Transactional(readOnly = true)
    public List<PayoutSummaryReport> getMemberPayouts(String memberId) {
        return payoutSummaryRepository.findByTenantIdAndMemberIdOrderByChitIdAsc(TenantContext.get(), memberId)
                .stream()
                .map(PayoutSummaryReport::from)
                .toList();
    }
}
