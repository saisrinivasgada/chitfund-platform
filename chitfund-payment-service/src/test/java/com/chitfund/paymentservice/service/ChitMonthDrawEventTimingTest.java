package com.chitfund.paymentservice.service;

import com.chitfund.common.context.TenantContext;
import com.chitfund.common.event.ChitMonthOpenedEvent;
import com.chitfund.common.event.ChitMonthSkippedEvent;
import com.chitfund.paymentservice.domain.ChitMonthDraw;
import com.chitfund.paymentservice.domain.PaymentAllocation;
import com.chitfund.paymentservice.domain.PaymentRecord;
import com.chitfund.paymentservice.domain.enums.DrawStatus;
import com.chitfund.paymentservice.domain.enums.PaymentRecordStatus;
import com.chitfund.paymentservice.dto.request.OpenMonthRequest;
import com.chitfund.paymentservice.dto.request.SkipMonthRequest;
import com.chitfund.paymentservice.kafka.PaymentEventPublisher;
import com.chitfund.paymentservice.repository.ChitMonthDrawRepository;
import com.chitfund.paymentservice.repository.PaymentAllocationRepository;
import com.chitfund.paymentservice.repository.PaymentRecordRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.ArgumentCaptor;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.never;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@ExtendWith(MockitoExtension.class)
class ChitMonthDrawEventTimingTest {

    private static final String TENANT = "10000000-0000-0000-0000-000000000001";
    private static final UUID activeMemberId = UUID.fromString("20000000-0000-0000-0000-000000000001");

    @Mock private ChitMonthDrawRepository drawRepository;
    @Mock private PaymentRecordRepository paymentRecordRepository;
    @Mock private PaymentAllocationRepository allocationRepository;
    @Mock private PaymentEventPublisher eventPublisher;
    @Mock private com.chitfund.paymentservice.client.AuditClient auditClient;
    @Mock private PlanExpiryChecker planExpiryChecker;
    @Mock private MemberCreditService memberCreditService;
    @Mock private com.chitfund.paymentservice.client.ChitServiceClient chitServiceClient;
    @Mock private com.chitfund.paymentservice.client.PayoutServiceClient payoutServiceClient;

    @Mock private FinancialCommandLock commandLocks;
    @Mock private DrawReconciliationQueue reconciliationQueue;

    private ChitMonthDrawService service;

    @BeforeEach
    void setUp() {
        TenantContext.set(TENANT);
        service = new ChitMonthDrawService(
                drawRepository, paymentRecordRepository, allocationRepository,
                eventPublisher, auditClient, planExpiryChecker, commandLocks, reconciliationQueue, memberCreditService,
                chitServiceClient, payoutServiceClient);

        lenient().when(drawRepository.countByTenantIdAndChitIdAndStatusNot(anyString(), any(), any()))
                .thenReturn(0L);
        lenient().when(drawRepository.existsByTenantIdAndChitIdAndMonthNumber(anyString(), any(), anyInt()))
                .thenReturn(false);
        lenient().when(drawRepository.save(any(ChitMonthDraw.class))).thenAnswer(invocation -> invocation.getArgument(0));
        lenient().when(paymentRecordRepository.saveAll(anyList())).thenAnswer(invocation -> invocation.getArgument(0));
        lenient().when(memberCreditService.getBalance(any())).thenReturn(BigDecimal.ZERO);
        lenient().when(chitServiceClient.getChit(any())).thenAnswer(invocation -> {
            var dto = new com.chitfund.paymentservice.client.ChitServiceClient.ChitDto();
            dto.setId(invocation.getArgument(0));
            dto.setStatus("ACTIVE");
            dto.setDurationMonths(12);
            dto.setInstallmentAmount(new BigDecimal("1000.00"));
            dto.setWinnerSelectionMode("LOTTERY");
            return dto;
        });
        lenient().when(chitServiceClient.getDrawMemberAmounts(any())).thenAnswer(invocation -> {
            var dto = new com.chitfund.paymentservice.client.ChitServiceClient.MemberAmountDto();
            dto.setMemberId(activeMemberId);
            dto.setAmountDue(new BigDecimal("1000.00"));
            return List.of(dto);
        });
        lenient().when(chitServiceClient.getDrawDependencies(any(), anyInt())).thenReturn(noChitHistory());
        lenient().when(payoutServiceClient.getDrawDependencies(any(), anyInt())).thenReturn(noPayoutHistory());
        lenient().when(memberCreditService.getBalanceForUpdate(any())).thenReturn(BigDecimal.ZERO);
    }

    @AfterEach
    void tearDown() {
        TenantContext.clear();
    }

    @Test
    void openDrawHandsEventToTransactionalPublisherExactlyOnce() {
        service.openDraw(openRequest(), UUID.randomUUID(), "ADMIN");
        verify(eventPublisher, times(1)).publish(any(ChitMonthOpenedEvent.class));
    }

    @Test
    void skipDrawHandsEventToTransactionalPublisherExactlyOnce() {
        service.skipDraw(skipRequest(), UUID.randomUUID(), "ADMIN");
        verify(eventPublisher, times(1)).publish(any(ChitMonthSkippedEvent.class));
    }

    @Test
    void foreignTenantChitIsRejectedBeforeAnyFinancialWrite() {
        OpenMonthRequest request = openRequest();
        when(chitServiceClient.getChit(request.getChitId())).thenReturn(null);

        assertThatThrownBy(() -> service.openDraw(request, UUID.randomUUID(), "ADMIN"))
                .isInstanceOf(com.chitfund.common.exception.BusinessException.class)
                .hasMessageContaining("not found in this organization");

        verify(drawRepository, never()).save(any());
        verify(paymentRecordRepository, never()).saveAll(anyList());
    }

    @Test
    void clientCannotInsertAProfileThatIsNotEnrolled() {
        OpenMonthRequest request = openRequest();
        request.getMembers().get(0).setMemberId(UUID.randomUUID());

        assertThatThrownBy(() -> service.openDraw(request, UUID.randomUUID(), "ADMIN"))
                .isInstanceOf(com.chitfund.common.exception.BusinessException.class)
                .hasMessageContaining("exactly match");

        verify(drawRepository, never()).save(any());
    }

    @Test
    void clientCannotIncreaseTheConfiguredCycleLimit() {
        OpenMonthRequest request = openRequest();
        request.setMaxCycles(120);

        assertThatThrownBy(() -> service.openDraw(request, UUID.randomUUID(), "ADMIN"))
                .isInstanceOf(com.chitfund.common.exception.BusinessException.class)
                .hasMessageContaining("cycle limit");

        verify(drawRepository, never()).save(any());
    }

    @Test
    void clientCannotUnderstateAMembersAmountDue() {
        OpenMonthRequest request = openRequest();
        request.getMembers().get(0).setAmountDue(new BigDecimal("1.00"));

        assertThatThrownBy(() -> service.openDraw(request, UUID.randomUUID(), "ADMIN"))
                .isInstanceOf(com.chitfund.common.exception.BusinessException.class)
                .hasMessageContaining("ledger configuration");

        verify(drawRepository, never()).save(any());
    }

    @Test
    void skippedDrawPersistsAuthenticatedTenant() {
        service.skipDraw(skipRequest(), UUID.randomUUID(), "ADMIN");
        ArgumentCaptor<ChitMonthDraw> saved = ArgumentCaptor.forClass(ChitMonthDraw.class);
        verify(drawRepository).save(saved.capture());
        assertThat(saved.getValue().getTenantId()).isEqualTo(TENANT);
    }

    @Test
    void pristineOpenDrawCanBeDiscarded() {
        UUID drawId = UUID.randomUUID();
        UUID chitId = UUID.randomUUID();
        ChitMonthDraw draw = openDrawEntity(drawId, chitId);
        PaymentRecord record = outstandingRecord(chitId, 1);
        when(drawRepository.findByIdAndTenantIdForUpdate(drawId, TENANT)).thenReturn(java.util.Optional.of(draw));
        when(paymentRecordRepository.findByTenantIdAndChitIdAndMonthNumber(TENANT, chitId, 1))
                .thenReturn(List.of(record));
        when(allocationRepository.findByTenantIdAndPaymentRecordIdIn(TENANT, List.of(record.getId())))
                .thenReturn(List.of());

        service.deleteDraw(drawId, UUID.randomUUID(), "ADMIN");

        verify(paymentRecordRepository).deleteByTenantIdAndChitIdAndMonthNumber(TENANT, chitId, 1);
        verify(drawRepository).delete(draw);
        verify(auditClient).log(anyString(), anyString(), anyString(),
                org.mockito.ArgumentMatchers.eq("DRAW_DELETED"), anyString(), anyString(),
                any(), org.mockito.ArgumentMatchers.isNull(), org.mockito.ArgumentMatchers.eq(TENANT));
    }

    @Test
    void creditOrPayoutDeductionHistoryCannotBeSilentlyRevertedAndDeleted() {
        UUID drawId = UUID.randomUUID();
        UUID chitId = UUID.randomUUID();
        ChitMonthDraw draw = openDrawEntity(drawId, chitId);
        PaymentRecord record = outstandingRecord(chitId, 1);
        record.setStatus(PaymentRecordStatus.PAYOUT_DEDUCTED);
        record.setAmountPaid(new BigDecimal("1000.00"));
        record.setSettledByPayoutId(UUID.randomUUID());
        when(drawRepository.findByIdAndTenantIdForUpdate(drawId, TENANT)).thenReturn(java.util.Optional.of(draw));
        when(paymentRecordRepository.findByTenantIdAndChitIdAndMonthNumber(TENANT, chitId, 1))
                .thenReturn(List.of(record));

        assertThatThrownBy(() -> service.deleteDraw(drawId, UUID.randomUUID(), "ADMIN"))
                .isInstanceOf(com.chitfund.common.exception.BusinessException.class)
                .hasMessageContaining("history");

        verify(paymentRecordRepository, never()).save(any());
        verify(drawRepository, never()).delete(any());
    }

    @Test
    void paymentAllocationHistoryBlocksPhysicalDeletion() {
        UUID drawId = UUID.randomUUID();
        UUID chitId = UUID.randomUUID();
        ChitMonthDraw draw = openDrawEntity(drawId, chitId);
        PaymentRecord record = outstandingRecord(chitId, 1);
        when(drawRepository.findByIdAndTenantIdForUpdate(drawId, TENANT)).thenReturn(java.util.Optional.of(draw));
        when(paymentRecordRepository.findByTenantIdAndChitIdAndMonthNumber(TENANT, chitId, 1))
                .thenReturn(List.of(record));
        when(allocationRepository.findByTenantIdAndPaymentRecordIdIn(TENANT, List.of(record.getId())))
                .thenReturn(List.of(PaymentAllocation.builder().id(UUID.randomUUID()).build()));

        assertThatThrownBy(() -> service.deleteDraw(drawId, UUID.randomUUID(), "ADMIN"))
                .isInstanceOf(com.chitfund.common.exception.BusinessException.class)
                .hasMessageContaining("allocation history");
        verify(drawRepository, never()).delete(any());
    }

    @Test
    void winnerAuctionOrProcessedReservationHistoryBlocksPhysicalDeletion() {
        UUID drawId = UUID.randomUUID();
        UUID chitId = UUID.randomUUID();
        ChitMonthDraw draw = openDrawEntity(drawId, chitId);
        when(drawRepository.findByIdAndTenantIdForUpdate(drawId, TENANT)).thenReturn(java.util.Optional.of(draw));
        when(paymentRecordRepository.findByTenantIdAndChitIdAndMonthNumber(TENANT, chitId, 1))
                .thenReturn(List.of());
        var dependencies = noChitHistory();
        dependencies.setWinnerCount(1);
        when(chitServiceClient.getDrawDependencies(chitId, 1)).thenReturn(dependencies);

        assertThatThrownBy(() -> service.deleteDraw(drawId, UUID.randomUUID(), "ADMIN"))
                .isInstanceOf(com.chitfund.common.exception.BusinessException.class)
                .hasMessageContaining("winner, auction, or processed reservation");
        verify(payoutServiceClient, never()).getDrawDependencies(any(), anyInt());
        verify(drawRepository, never()).delete(any());
    }

    @Test
    void anyPayoutHistoryBlocksPhysicalDeletion() {
        UUID drawId = UUID.randomUUID();
        UUID chitId = UUID.randomUUID();
        ChitMonthDraw draw = openDrawEntity(drawId, chitId);
        when(drawRepository.findByIdAndTenantIdForUpdate(drawId, TENANT)).thenReturn(java.util.Optional.of(draw));
        when(paymentRecordRepository.findByTenantIdAndChitIdAndMonthNumber(TENANT, chitId, 1))
                .thenReturn(List.of());
        var dependencies = noPayoutHistory();
        dependencies.setPayoutCount(1);
        when(payoutServiceClient.getDrawDependencies(chitId, 1)).thenReturn(dependencies);

        assertThatThrownBy(() -> service.deleteDraw(drawId, UUID.randomUUID(), "ADMIN"))
                .isInstanceOf(com.chitfund.common.exception.BusinessException.class)
                .hasMessageContaining("payout history");
        verify(drawRepository, never()).delete(any());
    }

    private ChitMonthDraw openDrawEntity(UUID drawId, UUID chitId) {
        return ChitMonthDraw.builder().id(drawId).tenantId(TENANT).chitId(chitId)
                .monthNumber(1).status(DrawStatus.OPEN).build();
    }

    private PaymentRecord outstandingRecord(UUID chitId, int monthNumber) {
        return PaymentRecord.builder().id(UUID.randomUUID()).tenantId(TENANT).chitId(chitId)
                .memberId(UUID.randomUUID()).monthNumber(monthNumber)
                .amountDue(new BigDecimal("1000.00")).amountPaid(BigDecimal.ZERO)
                .status(PaymentRecordStatus.OUTSTANDING).build();
    }

    private com.chitfund.paymentservice.client.ChitServiceClient.DrawDependencyDto noChitHistory() {
        return new com.chitfund.paymentservice.client.ChitServiceClient.DrawDependencyDto();
    }

    private com.chitfund.paymentservice.client.PayoutServiceClient.DrawDependencyDto noPayoutHistory() {
        return new com.chitfund.paymentservice.client.PayoutServiceClient.DrawDependencyDto();
    }

    private OpenMonthRequest openRequest() {
        OpenMonthRequest.MemberAmount member = new OpenMonthRequest.MemberAmount();
        member.setMemberId(activeMemberId);
        member.setAmountDue(new BigDecimal("1000.00"));

        OpenMonthRequest request = new OpenMonthRequest();
        request.setChitId(UUID.randomUUID());
        request.setMonthNumber(1);
        request.setDueDate(LocalDate.of(2026, 10, 1));
        request.setInstallmentAmount(new BigDecimal("1000.00"));
        request.setMaxCycles(12);
        request.setMembers(List.of(member));
        return request;
    }

    private SkipMonthRequest skipRequest() {
        SkipMonthRequest request = new SkipMonthRequest();
        request.setChitId(UUID.randomUUID());
        request.setMonthNumber(1);
        request.setDueDate(LocalDate.of(2026, 10, 1));
        request.setInstallmentAmount(new BigDecimal("1000.00"));
        request.setSkipReason("Holiday pause");
        request.setMemberIds(List.of(activeMemberId));
        return request;
    }
}
