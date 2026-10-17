package com.chitfund.paymentservice.service;

import com.chitfund.common.context.TenantContext;
import com.chitfund.common.exception.BusinessException;
import com.chitfund.common.exception.ErrorCode;
import com.chitfund.paymentservice.client.*;
import com.chitfund.paymentservice.domain.PaymentBatch;
import com.chitfund.paymentservice.domain.PaymentRecord;
import com.chitfund.paymentservice.domain.OfflinePaymentReview;
import com.chitfund.paymentservice.domain.enums.PaymentRecordStatus;
import com.chitfund.paymentservice.exception.OfflineReviewRequiredException;
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
    @org.mockito.Mock FinancialCommandLock commandLocks;
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
    @Mock OfflinePaymentReviewCapture reviews;
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
        when(records.findTotalOutstandingByTenantIdAndMemberId(anyString(), any(), any())).thenReturn(request.getAmount());
        when(credit.getBalanceForUpdate(any())).thenReturn(BigDecimal.ZERO);
        var due = PaymentRecord.builder().id(UUID.randomUUID()).chitId(request.getChitId())
                .memberId(request.getMemberId()).amountDue(request.getAmount()).amountPaid(BigDecimal.ZERO)
                .monthNumber(1).status(PaymentRecordStatus.OUTSTANDING).build();
        when(records.findMemberOutstandingForUpdate(anyString(), any(), any())).thenReturn(java.util.List.of(due));
        when(records.findByTenantIdAndMemberIdAndChitIdAndStatusInForUpdateOrderByMonthNumberAsc(anyString(), any(), any(), any()))
                .thenReturn(java.util.List.of(due));
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

    @Test
    void clearedDuesPreserveCollectionForReviewWithoutPostingMoneyOrCredit() {
        var request = savedPayment();
        when(access.assertRecordedPaymentMaySync(any(), any(), any())).thenReturn("grant-a");
        when(members.isMemberActive(request.getMemberId())).thenReturn(true);
        when(credit.getBalanceForUpdate(any())).thenReturn(BigDecimal.ZERO);
        var reviewId = UUID.randomUUID();
        when(reviews.preserve(request, actor, "operation-a", "DUES_CHANGED")).thenReturn(reviewId);
        assertThatThrownBy(() -> service.recordPayment(request, actor, "operation-a"))
                .isInstanceOfSatisfying(OfflineReviewRequiredException.class, error -> assertThat(error.getReviewId()).isEqualTo(reviewId));
        verify(batches, never()).saveAndFlush(any());
        verify(credit, never()).addCredit(any(), any(), any(), any(), any(), any());
        verifyNoInteractions(wallet, events);
    }

    @Test
    void aMemberRemovedBeforeReconnectStillHasTheOriginalCashPreservedForReview() {
        var request = savedPayment();
        when(access.assertRecordedPaymentMaySync(any(), any(), any())).thenReturn("grant-a");
        when(reviews.preserve(request, actor, "operation-a", "MEMBER_CHANGED")).thenReturn(UUID.randomUUID());
        assertThatThrownBy(() -> service.recordPayment(request, actor, "operation-a"))
                .isInstanceOf(OfflineReviewRequiredException.class);
        verify(batches, never()).saveAndFlush(any());
        verifyNoInteractions(wallet, credit, events, audit);
    }

    @Test
    void partialDuesOrOtherChitDuesCannotSilentlyRedirectTheSavedCollection() {
        var request = savedPayment(); request.setAmount(new BigDecimal("1000"));
        when(access.assertRecordedPaymentMaySync(any(), any(), any())).thenReturn("grant-a");
        when(members.isMemberActive(request.getMemberId())).thenReturn(true);
        when(credit.getBalanceForUpdate(any())).thenReturn(BigDecimal.ZERO);
        var own = PaymentRecord.builder().id(UUID.randomUUID()).chitId(request.getChitId()).amountDue(new BigDecimal("400"))
                .amountPaid(BigDecimal.ZERO).status(PaymentRecordStatus.OUTSTANDING).build();
        var other = PaymentRecord.builder().id(UUID.randomUUID()).chitId(UUID.randomUUID()).amountDue(new BigDecimal("2000"))
                .amountPaid(BigDecimal.ZERO).status(PaymentRecordStatus.OUTSTANDING).build();
        when(records.findMemberOutstandingForUpdate(anyString(), any(), any())).thenReturn(java.util.List.of(own, other));
        when(reviews.preserve(any(), any(), any(), eq("DUES_CHANGED"))).thenReturn(UUID.randomUUID());
        assertThatThrownBy(() -> service.recordPayment(request, actor, "operation-a")).isInstanceOf(OfflineReviewRequiredException.class);
        verifyNoInteractions(wallet, events);
        verify(batches, never()).saveAndFlush(any());
    }

    @Test
    void pendingReviewDoesNotAutomaticallyPostWhenDuesLaterIncreaseAgain() {
        var request = savedPayment();
        when(access.assertRecordedPaymentMaySync(any(), any(), any())).thenReturn("grant-a");
        var pending = OfflinePaymentReview.builder().id(UUID.randomUUID()).status("PENDING").build();
        when(reviews.findOperation("operation-a")).thenReturn(Optional.of(pending));
        assertThatThrownBy(() -> service.recordPayment(request, actor, "operation-a")).isInstanceOf(OfflineReviewRequiredException.class);
        verifyNoInteractions(credit, wallet, events);
        verify(batches, never()).saveAndFlush(any());
    }

    @Test
    void matchingBankReferenceIsHeldForReviewRatherThanCreatedTwice() {
        var request = savedPayment(); request.setPaymentMode(PaymentMode.UPI); request.setPaymentReference("UTR-123");
        when(access.assertRecordedPaymentMaySync(any(), any(), any())).thenReturn("grant-a");
        when(batches.findByTenantIdAndPaymentModeAndPaymentReference("org-a", PaymentMode.UPI, "UTR-123"))
                .thenReturn(Optional.of(PaymentBatch.builder().id(UUID.randomUUID()).build()));
        when(reviews.preserve(request, actor, "operation-a", "REFERENCE_ALREADY_USED")).thenReturn(UUID.randomUUID());
        assertThatThrownBy(() -> service.recordPayment(request, actor, "operation-a")).isInstanceOf(OfflineReviewRequiredException.class);
        verifyNoInteractions(wallet, credit, events);
    }

    @Test
    void aChangedReviewSnapshotCannotApplyExcess() {
        var request = savedPayment();
        when(access.verifyHistoricalPaymentEvidence(any(), any(), any())).thenReturn("grant-a");
        when(members.isMemberActive(request.getMemberId())).thenReturn(true);
        when(credit.getBalanceForUpdate(any())).thenReturn(BigDecimal.ZERO);
        assertThatThrownBy(() -> service.recordReviewedOfflinePayment(request, actor, "operation-a", "old-balance-version"))
                .isInstanceOf(BusinessException.class).hasMessageContaining("balances changed");
        verify(batches, never()).saveAndFlush(any());
        verifyNoInteractions(wallet, events);
    }

    @Test
    void explicitlyReviewedLegacyCollectionCanReconcileAfterExpiryWithoutManufacturingAGrant() {
        var request = savedPayment(); request.setOfflineAuthorization(null);
        when(members.isMemberActive(request.getMemberId())).thenReturn(true);
        when(credit.getBalanceForUpdate(any())).thenReturn(BigDecimal.ZERO);
        var due = PaymentRecord.builder().id(UUID.randomUUID()).chitId(request.getChitId()).memberId(request.getMemberId())
                .monthNumber(1).amountDue(request.getAmount()).amountPaid(BigDecimal.ZERO).status(PaymentRecordStatus.OUTSTANDING).build();
        when(records.findMemberOutstandingForUpdate(anyString(), any(), any())).thenReturn(java.util.List.of(due));
        when(records.findByTenantIdAndMemberIdAndChitIdAndStatusInForUpdateOrderByMonthNumberAsc(anyString(), any(), any(), any()))
                .thenReturn(java.util.List.of(due));
        when(records.findTotalOutstandingByTenantIdAndMemberId(anyString(), any(), any())).thenReturn(request.getAmount());
        when(batches.saveAndFlush(any())).thenAnswer(call -> { PaymentBatch batch = call.getArgument(0); batch.setId(UUID.randomUUID()); return batch; });
        String version = service.offlineBalanceSnapshot(request, true).version();
        assertThat(service.recordReviewedLegacyPayment(request, actor, "legacy-operation", version).getRecordedAt()).isEqualTo(request.getRecordedAt());
        verifyNoInteractions(access);
        var fact = ArgumentCaptor.forClass(AuditClient.AuditDetails.class); verify(audit).log(fact.capture());
        assertThat(fact.getValue().action()).isEqualTo("LEGACY_PAYMENT_RECONCILED");
        assertThat(fact.getValue().metadata()).isEqualTo(java.util.Map.of("authority", "EXPLICIT_ADMIN_LEGACY_REVIEW", "originalTimeVerified", false));
    }

    @Test
    void aWebEntryFromDaysEarlierStillTriggersReviewEvenWhenNewInstalmentsAreOwed() {
        var request = savedPayment();
        when(access.assertRecordedPaymentMaySync(any(), any(), any())).thenReturn("grant-a");
        when(members.isMemberActive(request.getMemberId())).thenReturn(true);
        when(credit.getBalanceForUpdate(any())).thenReturn(BigDecimal.ZERO);
        var newDues = PaymentRecord.builder().id(UUID.randomUUID()).chitId(request.getChitId()).amountDue(new BigDecimal("1000"))
                .amountPaid(BigDecimal.ZERO).status(PaymentRecordStatus.OUTSTANDING).build();
        when(records.findMemberOutstandingForUpdate(anyString(), any(), any())).thenReturn(java.util.List.of(newDues));
        Instant since = request.getRecordedAt().minus(Duration.ofMinutes(10));
        when(batches.findRecentPossibleDuplicatesForReview(eq("org-a"), eq(request.getMemberId()), eq(request.getChitId()), eq(request.getAmount()),
                eq(since), eq(java.time.LocalDateTime.ofInstant(since, java.time.ZoneOffset.UTC))))
                .thenReturn(java.util.List.of(PaymentBatch.builder().id(UUID.randomUUID()).build()));
        when(reviews.preserve(request, actor, "operation-a", "POSSIBLE_DUPLICATE")).thenReturn(UUID.randomUUID());
        assertThatThrownBy(() -> service.recordPayment(request, actor, "operation-a")).isInstanceOf(OfflineReviewRequiredException.class);
        verify(batches, never()).saveAndFlush(any()); verifyNoInteractions(wallet, events);
    }
}
