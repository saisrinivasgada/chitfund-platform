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
    @Mock FinancialCommandLock commandLocks;
    OfflinePaymentReviewService service;
    OfflinePaymentReview review;
    RecordPaymentRequest original;
    final UUID admin = UUID.randomUUID();

    @BeforeEach void setup() throws Exception {
        TenantContext.set("org-a");
        var json = new ObjectMapper().findAndRegisterModules();
        service = new OfflinePaymentReviewService(reviews, batches, payments, audit, json, cash, cashRequests, capture, commandLocks);
        original = new RecordPaymentRequest(); original.setMemberId(UUID.randomUUID()); original.setChitId(UUID.randomUUID());
        original.setAmount(new BigDecimal("1000")); original.setPaymentMode(PaymentMode.CASH);
        original.setRecordedAt(Instant.parse("2026-10-15T12:00:00Z")); original.setOfflineAuthorization("saved-proof");
        review = OfflinePaymentReview.builder().id(UUID.randomUUID()).tenantId("org-a").actorId(UUID.randomUUID())
                .operationId("saved-operation").requestJson(json.writeValueAsString(original)).status("PENDING").reason("DUES_CHANGED").build();
        lenient().when(reviews.lock(review.getId(), "org-a")).thenReturn(Optional.of(review));
    }
    @AfterEach void clear() { TenantContext.clear(); }
    private ResolveOfflinePaymentReviewRequest decision(String action, UUID receipt) {
        return new ResolveOfflinePaymentReviewRequest(action, "current-version", "Verified with the member", receipt);
    }
    private void balance(String version) {
        when(payments.offlineBalanceSnapshot(any(), eq(true))).thenReturn(new PaymentService.OfflineBalanceSnapshot(
                version, BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO, true));
    }
    @Test void cancellingAnUnconfirmedEntryPreservesOriginalIntentAndCreatesNoMoney() {
        when(capture.preserveForCancellation(original, review.getActorId(), "saved-operation")).thenReturn(review.getId());
        var request = new CancelSavedOfflinePaymentRequest(review.getActorId(), original,
                new CancelOfflineCollectionRequest("Mistaken entry; no money received", true));
        var result = service.cancelUnconfirmed(request, "saved-operation", admin);
        assertThat(result.get("status")).isEqualTo("CANCELLED");
        verify(payments).verifyRecoveredCollection(original, review.getActorId());
        verify(payments, never()).recordReviewedOfflinePayment(any(), any(), any(), any());
        verify(reviews).saveAndFlush(review);
    }
    @Test void lostAcknowledgementUsesExistingReceiptAndLeavesVoidToTheNormalWorkflow() {
        UUID receipt = UUID.randomUUID();
        when(batches.findByTenantIdAndIdempotencyOperationAndIdempotencyKey("org-a", "RECORD_PAYMENT", "saved-operation"))
                .thenReturn(Optional.of(PaymentBatch.builder().id(receipt).recordedBy(review.getActorId())
                        .idempotencyRequestHash(PaymentService.recordPaymentFingerprint(original)).build()));
        when(payments.getBatchById(receipt)).thenReturn(PaymentBatchResponse.builder().id(receipt).build());
        var request = new CancelSavedOfflinePaymentRequest(review.getActorId(), original,
                new CancelOfflineCollectionRequest("Mistaken entry; no money received", true));
        var result = service.cancelUnconfirmed(request, "saved-operation", admin);
        assertThat(result.get("status")).isEqualTo("RECEIPT_EXISTS"); assertThat(result.get("receiptId")).isEqualTo(receipt);
        verify(commandLocks).lock("org-a", "saved-operation"); verifyNoInteractions(capture); verify(reviews, never()).saveAndFlush(any());
    }

    @Test void aReusedOperationWithDifferentDetailsCannotBeAcknowledgedAsThisCollection() {
        when(batches.findByTenantIdAndIdempotencyOperationAndIdempotencyKey("org-a", "RECORD_PAYMENT", "saved-operation"))
                .thenReturn(Optional.of(PaymentBatch.builder().id(UUID.randomUUID()).recordedBy(review.getActorId())
                        .idempotencyRequestHash("another-collection").build()));
        var request = new CancelSavedOfflinePaymentRequest(review.getActorId(), original,
                new CancelOfflineCollectionRequest("Mistaken entry; no money received", true));
        assertThatThrownBy(() -> service.cancelUnconfirmed(request, "saved-operation", admin))
                .isInstanceOf(BusinessException.class).hasMessageContaining("different payment details");
        verify(payments, never()).getBatchById(any());
        verifyNoInteractions(capture); verify(reviews, never()).saveAndFlush(any());
    }

    @Test void aReceiptFromAnotherOriginalActorCannotAcknowledgeTheSavedCollection() {
        when(batches.findByTenantIdAndIdempotencyOperationAndIdempotencyKey("org-a", "RECORD_PAYMENT", "saved-operation"))
                .thenReturn(Optional.of(PaymentBatch.builder().id(UUID.randomUUID()).recordedBy(UUID.randomUUID())
                        .idempotencyRequestHash(PaymentService.recordPaymentFingerprint(original)).build()));
        var request = new CancelSavedOfflinePaymentRequest(review.getActorId(), original,
                new CancelOfflineCollectionRequest("Mistaken entry; no money received", true));
        assertThatThrownBy(() -> service.cancelUnconfirmed(request, "saved-operation", admin))
                .isInstanceOf(BusinessException.class).hasMessageContaining("different payment details");
        verify(payments, never()).getBatchById(any()); verifyNoInteractions(capture);
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
        verifyNoInteractions(audit); verify(payments, never()).recordReviewedOfflinePayment(any(), any(), any(), any()); verify(reviews, never()).saveAndFlush(any());
    }
    @Test void aChangedRetryCannotReplaceAnAlreadyRecordedDecision() {
        review.setStatus("APPLIED"); review.setResolutionReason("Verified with the member");
        assertThatThrownBy(() -> service.resolve(review.getId(), decision("LINK_DUPLICATE", UUID.randomUUID()), admin))
                .isInstanceOf(BusinessException.class).hasMessageContaining("already reviewed differently");
        verifyNoInteractions(audit); verify(payments, never()).recordReviewedOfflinePayment(any(), any(), any(), any());
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
    private com.chitfund.paymentservice.dto.request.RecordOfflineCollectionRefundRequest refund(String amount, boolean returned) {
        return new com.chitfund.paymentservice.dto.request.RecordOfflineCollectionRefundRequest(new BigDecimal(amount), "CASH", "RETURN-123",
                Instant.now().minusSeconds(30), "Returned the held cash to the member", returned);
    }
    @Test void fullConfirmedRefundRecordsEvidenceWithoutCreatingPaymentOrCredit() {
        var returned = refund("1000", true);
        var result = service.recordRefund(review.getId(), returned, admin);
        assertThat(result.get("status")).isEqualTo("REFUNDED");
        assertThat(result.get("refund").toString()).contains("RETURN-123");
        assertThat(review.getReceiptId()).isNull();
        verify(payments, never()).recordPayment(any(), any(), any());
        verify(audit).log(any(AuditClient.AuditDetails.class));
        service.recordRefund(review.getId(), returned, admin);
        verify(reviews, times(1)).saveAndFlush(any());
        verify(audit, times(1)).log(any(AuditClient.AuditDetails.class));
    }
    @Test void partialOrUnconfirmedReturnsCannotCloseTheHeldCollection() {
        assertThatThrownBy(() -> service.recordRefund(review.getId(), refund("500", true), admin)).isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> service.recordRefund(review.getId(), refund("1000", false), admin)).isInstanceOf(BusinessException.class);
        assertThat(review.getStatus()).isEqualTo("PENDING"); verifyNoInteractions(audit); verify(payments, never()).recordPayment(any(), any(), any());
    }
    @Test void anAlreadyPostedReceiptRequiresTheReceiptReversalWorkflow() {
        when(batches.findByTenantIdAndIdempotencyOperationAndIdempotencyKey("org-a", "RECORD_PAYMENT", "saved-operation"))
                .thenReturn(Optional.of(PaymentBatch.builder().id(UUID.randomUUID()).build()));
        assertThatThrownBy(() -> service.recordRefund(review.getId(), refund("1000", true), admin))
                .isInstanceOf(BusinessException.class).hasMessageContaining("existing receipt");
        assertThat(review.getStatus()).isEqualTo("PENDING"); verifyNoInteractions(audit); verify(payments, never()).recordPayment(any(), any(), any());
    }
    @Test void refundedStaffCashClosesItsCustodyRequestWithoutMakingAPayment() {
        UUID requestId = UUID.randomUUID(); review.setCashRequestId(requestId);
        service.recordRefund(review.getId(), refund("1000", true), admin);
        verify(cash).closeRefundedPickup(requestId, original.getAmount(), admin, "RETURN-123", "Returned the held cash to the member");
        verify(payments, never()).recordPayment(any(), any(), any());
    }

    @Test void cancellingMistakenEntryRetainsEvidenceWithoutPostingAndRetriesAreIdempotent() {
        var cancellation = new CancelOfflineCollectionRequest("Wrong member selected; no money collected", true);
        var result = service.cancelMistakenEntry(review.getId(), cancellation, admin);
        assertThat(result.get("status")).isEqualTo("CANCELLED");
        assertThat(review.getRequestJson()).contains("saved-proof");
        assertThat(review.getReceiptId()).isNull();
        service.cancelMistakenEntry(review.getId(), cancellation, admin);
        verify(reviews, times(1)).saveAndFlush(any()); verify(audit, times(1)).log(any(AuditClient.AuditDetails.class));
        verifyNoInteractions(cash); verify(payments, never()).recordPayment(any(), any(), any());
        assertThatThrownBy(() -> service.recordRefund(review.getId(), refund("1000", true), admin)).isInstanceOf(BusinessException.class);
    }
    @Test void cancellationCannotHideCollectedMoneyOrAStaffCustodyRecord() {
        assertThatThrownBy(() -> service.cancelMistakenEntry(review.getId(), new CancelOfflineCollectionRequest("Cancel this collection", false), admin)).isInstanceOf(BusinessException.class);
        review.setCashRequestId(UUID.randomUUID());
        assertThatThrownBy(() -> service.cancelMistakenEntry(review.getId(), new CancelOfflineCollectionRequest("Cancel this collection", true), admin)).isInstanceOf(BusinessException.class);
        assertThat(review.getStatus()).isEqualTo("PENDING"); verifyNoInteractions(audit, cash); verify(payments, never()).recordPayment(any(), any(), any());
    }
    @Test void cancellationCannotHideAnExistingReceipt() {
        when(batches.findByTenantIdAndIdempotencyOperationAndIdempotencyKey("org-a", "RECORD_PAYMENT", "saved-operation"))
                .thenReturn(Optional.of(PaymentBatch.builder().id(UUID.randomUUID()).build()));
        assertThatThrownBy(() -> service.cancelMistakenEntry(review.getId(), new CancelOfflineCollectionRequest("No money collected", true), admin)).isInstanceOf(BusinessException.class);
        verifyNoInteractions(audit); verify(payments, never()).recordPayment(any(), any(), any());
    }
    @Test void recoveryRequiresHistoricalEvidenceBeforeQuarantiningOriginalActorAndOperation() {
        // This path has no locked review lookup until after proof is verified.
        Mockito.reset(reviews);
        UUID actor = UUID.randomUUID(); UUID id = UUID.randomUUID();
        when(capture.preserveRecovered(original, actor, "recovery-op")).thenReturn(id);
        assertThat(service.preserveRecovered(original, actor, "recovery-op", admin)).isEqualTo(id);
        var order = inOrder(payments, capture);
        order.verify(payments).verifyRecoveredCollection(original, actor);
        order.verify(capture).preserveRecovered(original, actor, "recovery-op");
        verify(payments, never()).recordPayment(any(), any(), any());
        verify(audit).log(any(AuditClient.AuditDetails.class));
    }
}
