package com.chitfund.reportingservice.service;

import com.chitfund.reportingservice.domain.MemberPaymentSummary;
import com.chitfund.reportingservice.domain.MonthlyCollectionSnapshot;
import com.chitfund.reportingservice.domain.PayoutSummary;
import com.chitfund.reportingservice.dto.ingest.CollectionSnapshotEvent;
import com.chitfund.reportingservice.dto.ingest.MemberPaymentEvent;
import com.chitfund.reportingservice.dto.ingest.PayoutEvent;
import com.chitfund.reportingservice.repository.MemberPaymentSummaryRepository;
import com.chitfund.reportingservice.repository.MonthlyCollectionSnapshotRepository;
import com.chitfund.reportingservice.repository.PayoutSummaryRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;

/**
 * WHY "ingest" as a separate service from query?
 * CQRS: write path (ingest) and read path (query) have different
 * consistency requirements, scaling needs, and callers. Keeping them
 * in separate classes makes each simpler and easier to evolve.
 * When we add Kafka later, ingest becomes a @KafkaListener — zero
 * changes to the query side.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class ReportIngestService {

    private final MonthlyCollectionSnapshotRepository snapshotRepository;
    private final MemberPaymentSummaryRepository memberSummaryRepository;
    private final PayoutSummaryRepository payoutSummaryRepository;

    @Transactional
    public void ingestCollectionSnapshot(CollectionSnapshotEvent event) {
        MonthlyCollectionSnapshot snapshot = snapshotRepository
                .findByChitIdAndMonthNumber(event.chitId(), event.monthNumber())
                .orElseGet(() -> MonthlyCollectionSnapshot.create(event.chitId(), event.tenantId()));

        if (event.tenantId() != null) snapshot.setTenantId(event.tenantId());
        snapshot.setChitName(event.chitName());
        snapshot.setMonthNumber(event.monthNumber());
        snapshot.setDueDate(event.dueDate());
        snapshot.setInstallmentAmount(event.installmentAmount());
        snapshot.setTotalMembers(event.totalMembers());
        snapshot.setSettledCount(event.settledCount());
        snapshot.setPartiallyPaidCount(event.partiallyPaidCount());
        snapshot.setOutstandingCount(event.outstandingCount());
        snapshot.setWaivedCount(event.waivedCount());
        snapshot.setTotalCollected(event.totalCollected());
        snapshot.setTotalOutstanding(event.totalOutstanding());
        snapshot.setCycleStatus(event.cycleStatus());
        snapshot.setSkipReason(event.skipReason());
        snapshot.setLastUpdated(Instant.now());

        snapshotRepository.save(snapshot);
        log.info("Ingested collection snapshot: chit={} month={} status={}",
                event.chitId(), event.monthNumber(), event.cycleStatus());
    }

    @Transactional
    public void ingestMemberPayment(MemberPaymentEvent event) {
        MemberPaymentSummary summary = memberSummaryRepository
                .findByMemberIdAndChitId(event.memberId(), event.chitId())
                .orElseGet(() -> MemberPaymentSummary.create(event.memberId(), event.chitId(), event.tenantId()));

        if (event.tenantId() != null) summary.setTenantId(event.tenantId());
        summary.setMemberName(event.memberName());
        summary.setMemberPhone(event.memberPhone());
        summary.setTotalDue(event.totalDue());
        summary.setTotalPaid(event.totalPaid());
        summary.setTotalOutstanding(event.totalOutstanding());
        summary.setMonthsSettled(event.monthsSettled());
        summary.setMonthsPartiallyPaid(event.monthsPartiallyPaid());
        summary.setMonthsOutstanding(event.monthsOutstanding());
        summary.setMonthsWaived(event.monthsWaived());
        summary.setLastPaymentDate(event.lastPaymentDate());
        summary.setLastPaymentAmount(event.lastPaymentAmount());
        summary.setLastUpdated(Instant.now());

        memberSummaryRepository.save(summary);
        log.info("Ingested member payment summary: member={} chit={} outstanding={}",
                event.memberId(), event.chitId(), event.totalOutstanding());
    }

    @Transactional
    public void ingestPayout(PayoutEvent event) {
        PayoutSummary summary = payoutSummaryRepository
                .findByChitIdAndMonthNumber(event.chitId(), event.monthNumber())
                .orElseGet(() -> PayoutSummary.create(event.chitId(), event.memberId(), event.monthNumber(), event.tenantId()));

        if (event.tenantId()      != null) summary.setTenantId(event.tenantId());
        if (event.memberId()      != null) summary.setMemberId(event.memberId());
        if (event.memberName()    != null) summary.setMemberName(event.memberName());
        if (event.winningAmount() != null) summary.setWinningAmount(event.winningAmount());
        if (event.discountAmount()!= null) summary.setDiscountAmount(event.discountAmount());
        if (event.netPayoutAmount()!=null) summary.setNetPayoutAmount(event.netPayoutAmount());
        summary.setStatus(event.status());
        if (event.disbursementMode()!=null) summary.setDisbursementMode(event.disbursementMode());
        if (event.disbursedAt()   != null) summary.setDisbursedAt(event.disbursedAt());
        summary.setLastUpdated(Instant.now());

        payoutSummaryRepository.save(summary);
        log.info("Ingested payout summary: chit={} month={} status={}",
                event.chitId(), event.monthNumber(), event.status());
    }
}
