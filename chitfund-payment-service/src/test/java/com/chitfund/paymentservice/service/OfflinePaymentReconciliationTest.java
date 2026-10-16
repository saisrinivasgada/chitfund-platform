package com.chitfund.paymentservice.service;

import com.chitfund.common.context.TenantContext;
import com.chitfund.common.exception.BusinessException;
import com.chitfund.common.exception.ErrorCode;
import com.chitfund.paymentservice.client.*;
import com.chitfund.paymentservice.domain.PaymentBatch;
import com.chitfund.paymentservice.domain.enums.PaymentMode;
import com.chitfund.paymentservice.dto.request.RecordPaymentRequest;
import com.chitfund.paymentservice.kafka.PaymentEventPublisher;
import com.chitfund.paymentservice.repository.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.*;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.Duration;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class OfflinePaymentReconciliationTest {
    @Mock PaymentBatchRepository batches;
    @Mock PaymentRecordRepository records;
    @Mock PaymentAllocationRepository allocations;
    @Mock PlanExpiryChecker access;
    @Mock PaymentEventPublisher events;
    @Mock MemberServiceClient members;
    @Mock ChitServiceClient chits;
    @Mock AdminWalletService wallet;
    @Mock NotificationService notifications;
    @Mock MemberCreditService credit;
    @Mock ChitMonthDrawService draws;
    @Mock AuditClient audit;
    @InjectMocks PaymentService service;
    private final UUID actor = UUID.randomUUID();

    @BeforeEach void tenant() { TenantContext.set("org-a"); }
    @AfterEach void clear() { TenantContext.clear(); }

    private RecordPaymentRequest savedPayment() {
        var request = new RecordPaymentRequest();
        request.setChitId(UUID.randomUUID());
        request.setMemberId(UUID.randomUUID());
        request.setAmount(new BigDecimal("100.00"));
        request.setPaymentMode(PaymentMode.CASH);
        request.setRecordedAt(Instant.now().minus(Duration.ofDays(90)));
        request.setOfflineAuthorization("historical-signed-proof");
        return request;
    }

    @Test
    void verifiedSavedPaymentOlderThanThirtyDaysPostsAndRecordsAuditWithoutRequiringRenewal() {
        var request = savedPayment();
        when(access.assertRecordedPaymentMaySync(actor, request.getOfflineAuthorization(), request.getRecordedAt()))
                .thenReturn("grant-a");
        when(members.isMemberActive(request.getMemberId())).thenReturn(true);
        when(records.findTotalOutstandingByTenantIdAndMemberId(anyString(), any(), any())).thenReturn(BigDecimal.ZERO);
        when(credit.getBalanceForUpdate(any())).thenReturn(BigDecimal.ZERO);
        when(batches.saveAndFlush(any())).thenAnswer(call -> {
            PaymentBatch batch = call.getArgument(0);
            batch.setId(UUID.randomUUID());
            return batch;
        });

        var response = service.recordPayment(request, actor, "operation-a");

        assertThat(response.getRecordedAt()).isEqualTo(request.getRecordedAt());
        assertThat(response.getSyncedAt()).isAfter(request.getRecordedAt());
        verify(access, never()).assertNotExpired();
        verify(wallet).addEntry(any(), eq(actor), eq("org-a"));
        var details = ArgumentCaptor.forClass(AuditClient.AuditDetails.class);
        verify(audit).log(details.capture());
        assertThat(details.getValue().originalOfflineAt()).isEqualTo(request.getRecordedAt());
        assertThat(details.getValue().metadata()).isEqualTo(java.util.Map.of("offlineGrantId", "grant-a"));
    }

    @Test
    void acknowledgementRetryReturnsExistingReceiptWithoutPostingMoneyAgain() {
        var request = savedPayment();
        when(access.assertRecordedPaymentMaySync(actor, request.getOfflineAuthorization(), request.getRecordedAt()))
                .thenReturn("grant-a");
        var existing = PaymentBatch.builder().id(UUID.randomUUID()).tenantId("org-a")
                .recordedAt(request.getRecordedAt()).totalAmount(request.getAmount())
                .idempotencyRequestHash(IdempotencyFingerprint.of(request.getChitId(), request.getMemberId(),
                        request.getAmount(), request.getPaymentMode(), request.getNotes(), null, request.getRecordedAt()))
                .build();
        when(batches.findByTenantIdAndIdempotencyOperationAndIdempotencyKey("org-a", "RECORD_PAYMENT", "operation-a"))
                .thenReturn(Optional.of(existing));

        assertThat(service.recordPayment(request, actor, "operation-a").getId()).isEqualTo(existing.getId());
        verify(batches, never()).saveAndFlush(any());
        verifyNoInteractions(wallet, events, audit);
    }

    @Test
    void unverifiedProofCannotSkipPaymentChecksOrCreateMoney() {
        var request = savedPayment();
        doThrow(new BusinessException(ErrorCode.FORBIDDEN, "Needs review", HttpStatus.FORBIDDEN))
                .when(access).assertRecordedPaymentMaySync(actor, request.getOfflineAuthorization(), request.getRecordedAt());
        assertThatThrownBy(() -> service.recordPayment(request, actor, "operation-a"))
                .isInstanceOf(BusinessException.class);
        verifyNoInteractions(batches, wallet, events);
    }

    @Test
    void historicalDeliveryStillRequiresIdentityAndCannotApplyCredit() {
        var request = savedPayment();
        assertThatThrownBy(() -> service.recordPayment(request, actor, null)).isInstanceOf(BusinessException.class);
        request.setPaymentMode(PaymentMode.CREDIT);
        assertThatThrownBy(() -> service.recordPayment(request, actor, "operation-a")).isInstanceOf(BusinessException.class);
        verifyNoInteractions(access, batches, wallet, events);
    }

    @Test
    void ordinaryPaymentsRetainSubscriptionAndRecordedDateChecks() {
        var request = savedPayment();
        request.setOfflineAuthorization(null);
        assertThatThrownBy(() -> service.recordPayment(request, actor, "operation-a"))
                .isInstanceOf(BusinessException.class).hasMessageContaining("30 days");
        verify(access).assertNotExpired();
        verify(access, never()).assertRecordedPaymentMaySync(any(), any(), any());
        verifyNoInteractions(batches, wallet, events);
    }
}
