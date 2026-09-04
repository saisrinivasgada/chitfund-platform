package com.chitfund.paymentservice.service;

import com.chitfund.common.context.TenantContext;
import com.chitfund.common.exception.BusinessException;
import com.chitfund.paymentservice.client.ChitServiceClient;
import com.chitfund.paymentservice.client.MemberServiceClient;
import com.chitfund.paymentservice.domain.PaymentBatch;
import com.chitfund.paymentservice.domain.Settlement;
import com.chitfund.paymentservice.domain.SettlementPaymentTransaction;
import com.chitfund.paymentservice.domain.enums.BatchStatus;
import com.chitfund.paymentservice.domain.enums.PaymentMode;
import com.chitfund.paymentservice.domain.enums.SettlementPaymentStatus;
import com.chitfund.paymentservice.dto.request.RecordPaymentRequest;
import com.chitfund.paymentservice.dto.request.RecordSettlementTransactionRequest;
import com.chitfund.paymentservice.kafka.PaymentEventPublisher;
import com.chitfund.paymentservice.repository.PaymentAllocationRepository;
import com.chitfund.paymentservice.repository.PaymentBatchRepository;
import com.chitfund.paymentservice.repository.PaymentRecordRepository;
import com.chitfund.paymentservice.repository.SettlementPaymentTransactionRepository;
import com.chitfund.paymentservice.repository.SettlementRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class FinancialIdempotencyTest {

    @Mock PaymentBatchRepository batchRepository;
    @Mock PaymentRecordRepository paymentRecordRepository;
    @Mock PaymentAllocationRepository allocationRepository;
    @Mock PlanExpiryChecker planExpiryChecker;
    @Mock PaymentEventPublisher eventPublisher;
    @Mock MemberServiceClient memberServiceClient;
    @Mock ChitServiceClient chitServiceClient;
    @Mock AdminWalletService adminWalletService;
    @Mock NotificationService notificationService;
    @Mock MemberCreditService memberCreditService;
    @Mock ChitMonthDrawService chitMonthDrawService;
    @Mock SettlementPaymentTransactionRepository transactionRepository;
    @Mock SettlementRepository settlementRepository;

    @AfterEach
    void clearTenant() {
        TenantContext.clear();
    }

    @Test
    void paymentKeyLookupIsTenantAndOperationScopedAndRejectsChangedPayload() {
        TenantContext.set("tenant-a");
        RecordPaymentRequest request = paymentRequest(new BigDecimal("100.00"));
        PaymentBatch existing = PaymentBatch.builder()
                .tenantId("tenant-a")
                .idempotencyKey("request-1")
                .idempotencyOperation("RECORD_PAYMENT")
                .idempotencyRequestHash("different-payload")
                .build();
        when(batchRepository.findByTenantIdAndIdempotencyOperationAndIdempotencyKey(
                "tenant-a", "RECORD_PAYMENT", "request-1"))
                .thenReturn(Optional.of(existing));

        PaymentService service = new PaymentService(
                batchRepository, paymentRecordRepository, allocationRepository,
                planExpiryChecker, eventPublisher, memberServiceClient, chitServiceClient,
                adminWalletService, notificationService, memberCreditService, chitMonthDrawService);

        assertThatThrownBy(() -> service.recordPayment(request, UUID.randomUUID(), "request-1"))
                .isInstanceOfSatisfying(BusinessException.class, ex ->
                        assertThat(ex.getHttpStatus()).isEqualTo(HttpStatus.CONFLICT));

        verify(batchRepository, never()).saveAndFlush(any());
    }

    @Test
    void settlementTransactionStoresTrustedTenantAndRequestFingerprint() {
        TenantContext.set("tenant-a");
        UUID settlementId = UUID.randomUUID();
        Settlement settlement = Settlement.builder()
                .id(settlementId)
                .tenantId("tenant-a")
                .memberId(UUID.randomUUID())
                .netAmount(new BigDecimal("100.00"))
                .collectedAmount(BigDecimal.ZERO)
                .disbursedAmount(BigDecimal.ZERO)
                .paymentStatus(SettlementPaymentStatus.PENDING)
                .chitItems(java.util.List.of())
                .build();
        RecordSettlementTransactionRequest request = settlementRequest(new BigDecimal("25.00"));
        when(transactionRepository.findByTenantIdAndIdempotencyKey("tenant-a", "settlement-request-1"))
                .thenReturn(Optional.empty());
        when(settlementRepository.findByIdWithLock(settlementId, "tenant-a"))
                .thenReturn(Optional.of(settlement));
        when(transactionRepository.saveAndFlush(any())).thenAnswer(invocation -> invocation.getArgument(0));

        SettlementTransactionService service = new SettlementTransactionService(
                transactionRepository, settlementRepository, adminWalletService);
        service.recordTransaction(settlementId, request, UUID.randomUUID());

        ArgumentCaptor<SettlementPaymentTransaction> captor =
                ArgumentCaptor.forClass(SettlementPaymentTransaction.class);
        verify(transactionRepository).saveAndFlush(captor.capture());
        assertThat(captor.getValue().getTenantId()).isEqualTo("tenant-a");
        assertThat(captor.getValue().getIdempotencyRequestHash()).hasSize(64);
    }

    @Test
    void settlementRetryWithChangedPayloadReturnsConflict() {
        TenantContext.set("tenant-a");
        UUID settlementId = UUID.randomUUID();
        Settlement settlement = Settlement.builder().id(settlementId).tenantId("tenant-a").build();
        SettlementPaymentTransaction existing = SettlementPaymentTransaction.builder()
                .settlement(settlement)
                .tenantId("tenant-a")
                .idempotencyKey("settlement-request-1")
                .idempotencyRequestHash("different-payload")
                .build();
        when(transactionRepository.findByTenantIdAndIdempotencyKey("tenant-a", "settlement-request-1"))
                .thenReturn(Optional.of(existing));

        SettlementTransactionService service = new SettlementTransactionService(
                transactionRepository, settlementRepository, adminWalletService);

        assertThatThrownBy(() -> service.recordTransaction(
                settlementId, settlementRequest(new BigDecimal("50.00")), UUID.randomUUID()))
                .isInstanceOfSatisfying(BusinessException.class, ex ->
                        assertThat(ex.getHttpStatus()).isEqualTo(HttpStatus.CONFLICT));

        verify(settlementRepository, never()).findByIdWithLock(any(), any());
    }

    private static RecordPaymentRequest paymentRequest(BigDecimal amount) {
        RecordPaymentRequest request = new RecordPaymentRequest();
        request.setChitId(UUID.randomUUID());
        request.setMemberId(UUID.randomUUID());
        request.setAmount(amount);
        request.setPaymentMode(PaymentMode.UPI);
        request.setNotes("monthly payment");
        return request;
    }

    private static RecordSettlementTransactionRequest settlementRequest(BigDecimal amount) {
        RecordSettlementTransactionRequest request = new RecordSettlementTransactionRequest();
        request.setAmount(amount);
        request.setMode(PaymentMode.CASH);
        request.setIdempotencyKey("settlement-request-1");
        request.setReferenceNumber("ref-1");
        request.setNotes("partial settlement");
        return request;
    }
}
