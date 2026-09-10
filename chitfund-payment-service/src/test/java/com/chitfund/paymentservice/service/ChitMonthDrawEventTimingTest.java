package com.chitfund.paymentservice.service;

import com.chitfund.common.context.TenantContext;
import com.chitfund.common.event.ChitMonthOpenedEvent;
import com.chitfund.common.event.ChitMonthSkippedEvent;
import com.chitfund.paymentservice.domain.ChitMonthDraw;
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
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionSynchronizationUtils;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ChitMonthDrawEventTimingTest {

    private static final String TENANT = "10000000-0000-0000-0000-000000000001";

    @Mock private ChitMonthDrawRepository drawRepository;
    @Mock private PaymentRecordRepository paymentRecordRepository;
    @Mock private PaymentAllocationRepository allocationRepository;
    @Mock private PaymentEventPublisher eventPublisher;
    @Mock private NotificationService notificationService;
    @Mock private com.chitfund.paymentservice.client.MemberServiceClient memberServiceClient;
    @Mock private com.chitfund.paymentservice.client.AuditClient auditClient;
    @Mock private PlanExpiryChecker planExpiryChecker;
    @Mock private MemberCreditService memberCreditService;

    private ChitMonthDrawService service;

    @BeforeEach
    void setUp() {
        TenantContext.set(TENANT);
        TransactionSynchronizationManager.initSynchronization();
        TransactionSynchronizationManager.setActualTransactionActive(true);

        service = new ChitMonthDrawService(
                drawRepository, paymentRecordRepository, allocationRepository,
                eventPublisher, notificationService, memberServiceClient,
                auditClient, planExpiryChecker, memberCreditService);

        lenient().when(drawRepository.countByChitIdAndStatusNot(any(), any())).thenReturn(0L);
        when(drawRepository.existsByChitIdAndMonthNumber(any(), anyInt())).thenReturn(false);
        when(drawRepository.save(any(ChitMonthDraw.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(paymentRecordRepository.saveAll(anyList())).thenAnswer(invocation -> invocation.getArgument(0));
        lenient().when(memberCreditService.getBalance(any())).thenReturn(BigDecimal.ZERO);
        lenient().when(memberServiceClient.batchGetUserIds(anyList())).thenReturn(Map.of());
    }

    @AfterEach
    void tearDown() {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.clearSynchronization();
        }
        TransactionSynchronizationManager.setActualTransactionActive(false);
        TenantContext.clear();
    }

    @Test
    void committedOpenDrawPublishesExactlyOnce() {
        service.openDraw(openRequest(), UUID.randomUUID(), "ADMIN");

        verify(eventPublisher, never()).publish(any(ChitMonthOpenedEvent.class));
        commitCallbacks();
        verify(eventPublisher).publish(any(ChitMonthOpenedEvent.class));
    }

    @Test
    void rolledBackOpenDrawPublishesNothing() {
        service.openDraw(openRequest(), UUID.randomUUID(), "ADMIN");

        rollbackCallbacks();
        verify(eventPublisher, never()).publish(any(ChitMonthOpenedEvent.class));
    }

    @Test
    void committedSkipDrawPublishesExactlyOnce() {
        service.skipDraw(skipRequest(), UUID.randomUUID(), "ADMIN");

        verify(eventPublisher, never()).publish(any(ChitMonthSkippedEvent.class));
        commitCallbacks();
        verify(eventPublisher).publish(any(ChitMonthSkippedEvent.class));
    }

    @Test
    void rolledBackSkipDrawPublishesNothing() {
        service.skipDraw(skipRequest(), UUID.randomUUID(), "ADMIN");

        rollbackCallbacks();
        verify(eventPublisher, never()).publish(any(ChitMonthSkippedEvent.class));
    }

    private void commitCallbacks() {
        TransactionSynchronizationUtils.invokeAfterCommit(TransactionSynchronizationManager.getSynchronizations());
    }

    private void rollbackCallbacks() {
        TransactionSynchronizationUtils.invokeAfterCompletion(
                TransactionSynchronizationManager.getSynchronizations(),
                TransactionSynchronization.STATUS_ROLLED_BACK);
    }

    private OpenMonthRequest openRequest() {
        UUID memberId = UUID.randomUUID();
        OpenMonthRequest.MemberAmount member = new OpenMonthRequest.MemberAmount();
        member.setMemberId(memberId);
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
        request.setMemberIds(List.of(UUID.randomUUID()));
        return request;
    }
}
