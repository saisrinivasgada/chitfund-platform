package com.chitfund.paymentservice.service;

import com.chitfund.common.context.TenantContext;
import com.chitfund.common.exception.BusinessException;
import com.chitfund.paymentservice.client.AuditClient;
import com.chitfund.paymentservice.domain.*;
import com.chitfund.paymentservice.domain.enums.*;
import com.chitfund.paymentservice.dto.request.*;
import com.chitfund.paymentservice.dto.response.PaymentBatchResponse;
import com.chitfund.paymentservice.repository.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.*;
import org.mockito.junit.jupiter.MockitoExtension;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class OfflinePaymentReviewServiceTest {
    @Mock OfflinePaymentReviewRepository reviews;
    @Mock PaymentBatchRepository batches;
    @Mock PaymentService payments;
    @Mock AuditClient audit;
    @Mock CashRequestService cash;
    @Mock CashPaymentRequestRepository cashRequests;
    @Mock OfflinePaymentReviewCapture capture;
    OfflinePaymentReviewService service;
    OfflinePaymentReview review;
    RecordPaymentRequest original;
    final UUID admin = UUID.randomUUID();

    @BeforeEach void setup() throws Exception {
        TenantContext.set("org-a");
        var json = new ObjectMapper().findAndRegisterModules();
        service = new OfflinePaymentReviewService(reviews, batches, payments, audit, json, cash, cashRequests, capture);
        original = new RecordPaymentRequest(); original.setMemberId(UUID.randomUUID()); original.setChitId(UUID.randomUUID());
        original.setAmount(new BigDecimal("1000")); original.setPaymentMode(PaymentMode.CASH);
        original.setRecordedAt(Instant.parse("2026-10-15T12:00:00Z")); original.setOfflineAuthorization("saved-proof");
        review = OfflinePaymentReview.builder().id(UUID.randomUUID()).tenantId("org-a").actorId(UUID.randomUUID())
                .operationId("saved-operation").requestJson(json.writeValueAsString(original)).status("PENDING").reason("DUES_CHANGED").build();
        when(reviews.lock(review.getId(), "org-a")).thenReturn(Optional.of(review));
    }
    @AfterEach void clear() { TenantContext.clear(); }
    private ResolveOfflinePaymentReviewRequest decision(String action, UUID receipt) {
        return new ResolveOfflinePaymentReviewRequest(action, "current-version", "Verified with the member", receipt);
    }
    private void balance(String version) {
        when(payments.offlineBalanceSnapshot(any(), eq(true))).thenReturn(new PaymentService.OfflineBalanceSnapshot(
                version, BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO, true));
    }
    @Test void staleFiguresNeverApplyMoneyOrMarkTheReviewResolved() {
        balance("changed-version");
        assertThatThrownBy(() -> service.resolve(review.getId(), decision("APPLY_WITH_EXCESS", null), admin))
                .isInstanceOf(BusinessException.class).hasMessageContaining("balances changed");
        verify(payments, never()).recordReviewedOfflinePayment(any(), any(), any(), any());
        verify(reviews, never()).saveAndFlush(any()); verifyNoInteractions(audit);
    }
    @Test void explicitApprovalUsesOriginalCollectionIdentityAndAuditsTheReviewer() {
        balance("current-version"); UUID receipt = UUID.randomUUID();
        when(payments.recordReviewedOfflinePayment(any(), eq(review.getActorId()), eq("saved-operation"), eq("current-version")))
                .thenReturn(PaymentBatchResponse.builder().id(receipt).build());
        var result = service.resolve(review.getId(), decision("APPLY_WITH_EXCESS", null), admin);
        assertThat(result.get("status")).isEqualTo("APPLIED"); assertThat(result.get("receiptId")).isEqualTo(receipt);
        assertThat(review.getResolvedBy()).isEqualTo(admin);
        var recorded = ArgumentCaptor.forClass(RecordPaymentRequest.class);
        verify(payments).recordReviewedOfflinePayment(recorded.capture(), any(), any(), any());
        assertThat(recorded.getValue().getOfflineAuthorization()).isEqualTo("saved-proof");
        assertThat(recorded.getValue().getRecordedAt()).isEqualTo(original.getRecordedAt());
        var event = ArgumentCaptor.forClass(AuditClient.AuditDetails.class); verify(audit).log(event.capture());
        assertThat(event.getValue().actorId()).isEqualTo(admin.toString());
        assertThat(result).doesNotContainKey("offlineAuthorization");
    }
    @Test void linkingTheSameCollectionCreatesNoNewMoneyAndRetainsTheOriginalReceipt() {
        balance("current-version"); UUID id = UUID.randomUUID();
        when(batches.findByIdAndTenantIdForUpdate(id, "org-a")).thenReturn(Optional.of(PaymentBatch.builder().id(id)
                .memberId(original.getMemberId()).totalAmount(original.getAmount()).paymentMode(PaymentMode.CASH).status(BatchStatus.COMPLETED).build()));
        assertThat(service.resolve(review.getId(), decision("LINK_DUPLICATE", id), admin).get("status")).isEqualTo("DUPLICATE");
        verify(payments, never()).recordReviewedOfflinePayment(any(), any(), any(), any());
        verify(audit).log(any(AuditClient.AuditDetails.class));
    }
    @Test void aDifferentMembersReceiptCannotBeUsedToEraseThisCollection() {
        balance("current-version"); UUID id = UUID.randomUUID();
        when(batches.findByIdAndTenantIdForUpdate(id, "org-a")).thenReturn(Optional.of(PaymentBatch.builder().id(id)
                .memberId(UUID.randomUUID()).totalAmount(original.getAmount()).paymentMode(PaymentMode.CASH).status(BatchStatus.COMPLETED).build()));
        assertThatThrownBy(() -> service.resolve(review.getId(), decision("LINK_DUPLICATE", id), admin))
                .isInstanceOf(BusinessException.class).hasMessageContaining("does not match");
        verify(reviews, never()).saveAndFlush(any()); verifyNoInteractions(audit);
    }
    @Test void anAcknowledgementRetryDoesNotRepeatTheDecisionOrPostMoneyAgain() {
        review.setStatus("APPLIED"); review.setReceiptId(UUID.randomUUID()); review.setResolutionReason("Verified with the member");
        assertThat(service.resolve(review.getId(), decision("APPLY_WITH_EXCESS", null), admin).get("receiptId")).isEqualTo(review.getReceiptId());
        verifyNoInteractions(payments, audit); verify(reviews, never()).saveAndFlush(any());
    }
    @Test void aChangedRetryCannotReplaceAnAlreadyRecordedDecision() {
        review.setStatus("APPLIED"); review.setResolutionReason("Verified with the member");
        assertThatThrownBy(() -> service.resolve(review.getId(), decision("LINK_DUPLICATE", UUID.randomUUID()), admin))
                .isInstanceOf(BusinessException.class).hasMessageContaining("already reviewed differently");
        verifyNoInteractions(payments, audit);
    }

    @Test void anOlderUnsignedCollectionUsesExplicitLegacyReviewRatherThanInventedAuthority() throws Exception {
        original.setOfflineAuthorization(null); review.setReason("LEGACY_UNVERIFIED");
        review.setRequestJson(new ObjectMapper().findAndRegisterModules().writeValueAsString(original));
        balance("current-version"); UUID receipt = UUID.randomUUID();
        when(payments.recordReviewedLegacyPayment(any(), eq(review.getActorId()), eq("saved-operation"), eq("current-version")))
                .thenReturn(PaymentBatchResponse.builder().id(receipt).build());
        assertThat(service.resolve(review.getId(), decision("APPLY_WITH_EXCESS", null), admin).get("receiptId")).isEqualTo(receipt);
        verify(payments, never()).recordReviewedOfflinePayment(any(), any(), any(), any());
        verify(audit).log(any(AuditClient.AuditDetails.class));
    }

    @Test void aStaffPickupIsReviewedThroughItsExistingCashRequestRatherThanASecondPayment() {
        UUID requestId = UUID.randomUUID(); review.setCashRequestId(requestId); balance("current-version");
        when(cashRequests.findByIdAndTenantIdForUpdate(requestId, "org-a")).thenReturn(Optional.of(CashPaymentRequest.builder().id(requestId).build()));
        UUID receipt = UUID.randomUUID();
        when(cash.collectReviewedPickup(requestId, admin, original.getAmount(), "current-version"))
                .thenReturn(PaymentBatchResponse.builder().id(receipt).build());
        assertThat(service.resolve(review.getId(), decision("APPLY_WITH_EXCESS", null), admin).get("receiptId")).isEqualTo(receipt);
        verify(payments, never()).recordReviewedOfflinePayment(any(), any(), any(), any());
    }
}
