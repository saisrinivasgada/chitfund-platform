package com.chitfund.paymentservice.service;

import com.chitfund.common.exception.BusinessException;
import com.chitfund.paymentservice.domain.PaymentAllocation;
import com.chitfund.paymentservice.domain.PaymentBatch;
import com.chitfund.paymentservice.domain.PaymentRecord;
import com.chitfund.paymentservice.domain.enums.BatchStatus;
import com.chitfund.paymentservice.domain.enums.PaymentRecordStatus;
import com.chitfund.paymentservice.kafka.PaymentEventPublisher;
import com.chitfund.paymentservice.repository.PaymentAllocationRepository;
import com.chitfund.paymentservice.repository.PaymentBatchRepository;
import com.chitfund.paymentservice.repository.PaymentRecordRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.doThrow;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class PayoutDeductionReversalTest {
    @org.mockito.Mock FinancialCommandLock commandLocks;
    private static final String TENANT = "tenant-a";

    @Mock PaymentBatchRepository batchRepository;
    @Mock PaymentRecordRepository paymentRecordRepository;
    @Mock PaymentAllocationRepository allocationRepository;
    @Mock PlanExpiryChecker planExpiryChecker;
    @Mock PaymentEventPublisher eventPublisher;
    @Mock com.chitfund.paymentservice.client.MemberServiceClient memberServiceClient;
    @Mock com.chitfund.paymentservice.client.ChitServiceClient chitServiceClient;
    @Mock AdminWalletService adminWalletService;
    @Mock NotificationService notificationService;
    @Mock MemberCreditService memberCreditService;
    @Mock ChitMonthDrawService chitMonthDrawService;
    @Mock com.chitfund.paymentservice.client.AuditClient auditClient;
    @InjectMocks PaymentService service;

    @Test
    void partialInstallmentDeductionIsLinkedAndReversible() {
        UUID payoutId = UUID.randomUUID();
        PaymentRecord record = record("1000", "200");
        when(paymentRecordRepository
                .findByTenantIdAndChitIdAndMemberIdAndMonthNumberForUpdate(
                        TENANT, record.getChitId(), record.getMemberId(), 1))
                .thenReturn(Optional.of(record));
        when(paymentRecordRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        service.markPayoutDeducted(record.getChitId(), record.getMemberId(), 1,
                new BigDecimal("300"), payoutId, TENANT);

        assertThat(record.getAmountPaid()).isEqualByComparingTo("500");
        assertThat(record.getStatus()).isEqualTo(PaymentRecordStatus.PARTIALLY_PAID);
        assertThat(record.getSettledByPayoutId()).isEqualTo(payoutId);

        UUID cashBatchId = UUID.randomUUID();
        PaymentAllocation originalCash = PaymentAllocation.builder()
                .id(UUID.randomUUID()).tenantId(TENANT).batchId(cashBatchId)
                .paymentRecordId(record.getId()).allocatedAmount(new BigDecimal("200"))
                .build();
        when(paymentRecordRepository.findByTenantIdAndSettledByPayoutIdForUpdate(TENANT, payoutId))
                .thenReturn(List.of(record));
        when(allocationRepository.findByTenantIdAndPaymentRecordIdIn(
                TENANT, List.of(record.getId())))
                .thenReturn(List.of(originalCash));
        when(batchRepository.findAllByTenantIdAndIdIn(eq(TENANT), any())).thenReturn(List.of(
                PaymentBatch.builder().id(cashBatchId).tenantId(TENANT)
                        .status(BatchStatus.COMPLETED).build()));

        service.revertPayoutDeductions(payoutId, TENANT);

        assertThat(record.getAmountPaid()).isEqualByComparingTo("200");
        assertThat(record.getStatus()).isEqualTo(PaymentRecordStatus.PARTIALLY_PAID);
        assertThat(record.getSettledByPayoutId()).isNull();
    }

    @Test
    void anotherPayoutCannotOverwriteAnExistingDeductionLink() {
        PaymentRecord record = record("1000", "500");
        record.setSettledByPayoutId(UUID.randomUUID());
        when(paymentRecordRepository
                .findByTenantIdAndChitIdAndMemberIdAndMonthNumberForUpdate(
                        TENANT, record.getChitId(), record.getMemberId(), 1))
                .thenReturn(Optional.of(record));

        assertThatThrownBy(() -> service.markPayoutDeducted(
                record.getChitId(), record.getMemberId(), 1, new BigDecimal("100"),
                UUID.randomUUID(), TENANT))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("payout deduction");
    }

    @Test
    void crossChitPartialDeductionKeepsItsPayoutLink() {
        UUID payoutId = UUID.randomUUID();
        PaymentRecord record = record("1000", "200");
        when(paymentRecordRepository
                .findByTenantIdAndMemberIdAndChitIdAndStatusInForUpdateOrderByMonthNumberAsc(
                        TENANT, record.getMemberId(), record.getChitId(),
                        PaymentRecordStatus.outstandingStatuses()))
                .thenReturn(List.of(record));
        when(paymentRecordRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        service.markCrossChitDisbursementSettled(
                record.getChitId(), record.getMemberId(), new BigDecimal("300"),
                payoutId, TENANT);

        assertThat(record.getAmountPaid()).isEqualByComparingTo("500");
        assertThat(record.getStatus()).isEqualTo(PaymentRecordStatus.PARTIALLY_PAID);
        assertThat(record.getSettledByPayoutId()).isEqualTo(payoutId);
    }

    @Test
    void autoCloseFailureAbortsCrossChitDeduction() {
        UUID payoutId = UUID.randomUUID();
        PaymentRecord record = record("1000", "0");
        when(paymentRecordRepository
                .findByTenantIdAndMemberIdAndChitIdAndStatusInForUpdateOrderByMonthNumberAsc(
                        TENANT, record.getMemberId(), record.getChitId(),
                        PaymentRecordStatus.outstandingStatuses()))
                .thenReturn(List.of(record));
        doThrow(new IllegalStateException("draw write failed")).when(chitMonthDrawService)
                .autoCloseIfAllSettled(record.getChitId(), 1);

        assertThatThrownBy(() -> service.markCrossChitDisbursementSettled(
                record.getChitId(), record.getMemberId(), new BigDecimal("1000"), payoutId, TENANT))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("draw write failed");
    }

    @Test
    void autoReopenFailureAbortsPayoutDeductionReversal() {
        UUID payoutId = UUID.randomUUID();
        PaymentRecord record = record("1000", "1000");
        record.setStatus(PaymentRecordStatus.PAYOUT_DEDUCTED);
        record.setPayoutDeductedAmount(new BigDecimal("1000"));
        record.setSettledByPayoutId(payoutId);
        when(paymentRecordRepository.findByTenantIdAndSettledByPayoutIdForUpdate(TENANT, payoutId))
                .thenReturn(List.of(record));
        when(allocationRepository.findByTenantIdAndPaymentRecordIdIn(
                TENANT, List.of(record.getId()))).thenReturn(List.of());
        doThrow(new IllegalStateException("draw write failed")).when(chitMonthDrawService)
                .autoReopenIfNotFullySettled(record.getChitId(), 1);

        assertThatThrownBy(() -> service.revertPayoutDeductions(payoutId, TENANT))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("draw write failed");
    }

    @Test
    void payoutReversalPreservesOpeningCreditAndLaterCashAndAccumulatesSamePayoutCommands() {
        UUID payoutId = UUID.randomUUID();
        PaymentRecord record = record("1000", "500");
        record.setStatus(PaymentRecordStatus.PARTIAL_CREDIT);
        when(paymentRecordRepository.findByTenantIdAndChitIdAndMemberIdAndMonthNumberForUpdate(
                TENANT, record.getChitId(), record.getMemberId(), 1)).thenReturn(Optional.of(record));
        service.markPayoutDeducted(record.getChitId(), record.getMemberId(), 1, new BigDecimal("100"), payoutId, TENANT);
        service.markPayoutDeducted(record.getChitId(), record.getMemberId(), 1, new BigDecimal("200"), payoutId, TENANT);
        assertThat(record.getPayoutDeductedAmount()).isEqualByComparingTo("300");
        record.setAmountPaid(new BigDecimal("950")); // another 150 cash arrived after deduction
        when(paymentRecordRepository.findByTenantIdAndSettledByPayoutIdForUpdate(TENANT, payoutId)).thenReturn(List.of(record));
        service.revertPayoutDeductions(payoutId, TENANT);
        assertThat(record.getAmountPaid()).isEqualByComparingTo("650");
        assertThat(record.getAmountDue().subtract(record.getAmountPaid())).isEqualByComparingTo("350");
        assertThat(record.getSettledByPayoutId()).isNull();
        assertThat(record.getPayoutDeductedAmount()).isNull();
    }

    @Test
    void aLegacyUnknownDeductionStopsTheWholeReversalBeforeChangingKnownRows() {
        UUID payoutId = UUID.randomUUID();
        PaymentRecord known = record("1000", "800"); known.setSettledByPayoutId(payoutId); known.setPayoutDeductedAmount(new BigDecimal("300"));
        PaymentRecord legacy = record("1000", "1000"); legacy.setSettledByPayoutId(payoutId);
        when(paymentRecordRepository.findByTenantIdAndSettledByPayoutIdForUpdate(TENANT, payoutId)).thenReturn(List.of(known,legacy));
        assertThatThrownBy(() -> service.revertPayoutDeductions(payoutId,TENANT)).isInstanceOf(BusinessException.class).hasMessageContaining("reconciliation");
        assertThat(known.getAmountPaid()).isEqualByComparingTo("800");
        assertThat(legacy.getAmountPaid()).isEqualByComparingTo("1000");
    }

    @Test
    void crossChitDeductionCannotReplaceAnotherPayoutOrExtendAnUnprovenLegacyLink() {
        UUID payoutId = UUID.randomUUID(); PaymentRecord record=record("1000","500");
        when(paymentRecordRepository.findByTenantIdAndMemberIdAndChitIdAndStatusInForUpdateOrderByMonthNumberAsc(
                TENANT,record.getMemberId(),record.getChitId(),PaymentRecordStatus.outstandingStatuses())).thenReturn(List.of(record));
        record.setSettledByPayoutId(UUID.randomUUID());record.setPayoutDeductedAmount(new BigDecimal("100"));
        assertThatThrownBy(() -> service.markCrossChitDisbursementSettled(record.getChitId(),record.getMemberId(),new BigDecimal("100"),payoutId,TENANT)).isInstanceOf(BusinessException.class);
        record.setSettledByPayoutId(payoutId);record.setPayoutDeductedAmount(null);
        assertThatThrownBy(() -> service.markCrossChitDisbursementSettled(record.getChitId(),record.getMemberId(),new BigDecimal("100"),payoutId,TENANT)).isInstanceOf(BusinessException.class);
        assertThat(record.getAmountPaid()).isEqualByComparingTo("500");
    }

    private PaymentRecord record(String due, String paid) {
        return PaymentRecord.builder()
                .id(UUID.randomUUID()).tenantId(TENANT)
                .chitId(UUID.randomUUID()).memberId(UUID.randomUUID())
                .monthNumber(1).dueDate(LocalDate.of(2026, 1, 1))
                .amountDue(new BigDecimal(due)).amountPaid(new BigDecimal(paid))
                .status(new BigDecimal(paid).signum() == 0
                        ? PaymentRecordStatus.OUTSTANDING
                        : PaymentRecordStatus.PARTIALLY_PAID)
                .build();
    }
}
