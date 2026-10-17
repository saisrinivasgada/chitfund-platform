package com.chitfund.paymentservice.service;

import com.chitfund.common.context.TenantContext;
import com.chitfund.common.exception.*;
import com.chitfund.paymentservice.client.*;
import com.chitfund.paymentservice.domain.*;
import com.chitfund.paymentservice.domain.enums.CashRequestStatus;
import com.chitfund.paymentservice.dto.request.*;
import com.chitfund.paymentservice.dto.response.CashRequestResponse;
import com.chitfund.paymentservice.repository.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.*;
import org.mockito.junit.jupiter.MockitoExtension;
import java.math.BigDecimal;
import java.time.*;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class OfflineStaffReviewServiceTest {
    @Mock OfflineStaffReviewRepository reviews;
    @Mock OfflineCommandReceiptRepository receipts;
    @Mock CashPaymentRequestRepository requests;
    @Mock CashRequestService cash;
    @Mock UserServiceClient users;
    @Mock FinancialCommandLock locks;
    @Mock AuditClient audit;
    @Mock EntityManager entities;
    OfflineStaffReviewService service;
    ObjectMapper json = new ObjectMapper().findAndRegisterModules().disable(com.fasterxml.jackson.databind.SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
    UUID actor = UUID.randomUUID(), admin = UUID.randomUUID();
    OfflineStaffActionRequest original;
    OfflineStaffReview review;
    CashPaymentRequest request;
    @BeforeEach void setup() throws Exception {
        TenantContext.set("org-a");
        service = new OfflineStaffReviewService(reviews,receipts,requests,cash,users,locks,audit,json,entities);
        original = new OfflineStaffActionRequest(); original.setOperationId("saved-pickup"); original.setRequestId(UUID.randomUUID());
        original.setAction("PARTIAL_COLLECT"); original.setCollectedAmount(new BigDecimal("100.00"));
        original.setExpectedUpdatedAt(LocalDateTime.parse("2026-01-01T10:00:00"));
        original.setRecordedAt(Instant.parse("2026-01-01T11:00:00Z")); original.setOfflineAuthorization("original-signed-grant");
        original.setCollectionSnapshot(new OfflineStaffActionRequest.CollectionSnapshot(UUID.randomUUID(),UUID.randomUUID(),new BigDecimal("200.00")));
        review = OfflineStaffReview.builder().id(UUID.randomUUID()).tenantId("org-a").actorId(actor).actorRole("STAFF")
                .operationId(original.getOperationId()).requestId(original.getRequestId()).requestJson(json.writeValueAsString(original))
                .payloadHash(OfflineStaffReviewService.fingerprint(original,"grant-a")).status("PENDING").build();
        request = CashPaymentRequest.builder().id(original.getRequestId()).tenantId("org-a").memberId(original.getCollectionSnapshot().memberId())
                .chitId(original.getCollectionSnapshot().chitId()).requestedAmount(new BigDecimal("200"))
                .assignedStaffId(actor).status(CashRequestStatus.ASSIGNED).updatedAt(original.getExpectedUpdatedAt().plusDays(1)).build();
    }
    @AfterEach void clear() { TenantContext.clear(); }
    void authorise() { when(users.verifyOfflineHistoricalEvidence(any())).thenReturn("grant-a"); }
    void resolving() {
        authorise(); when(reviews.findByIdAndTenantId(review.getId(),"org-a")).thenReturn(Optional.of(review));
        when(requests.findByIdAndTenantIdForUpdate(request.getId(),"org-a")).thenReturn(Optional.of(request));
    }
    String version() {
        return IdempotencyFingerprint.of(request.getId(),request.getMemberId(),request.getChitId(),request.getStatus(),request.getRequestedAmount(),
                request.getCollectedAmount(),request.getAssignedStaffId(),request.getPickedUpBy(),request.getMemberApproved(),request.getCollectedBatchId(),request.getUpdatedAt());
    }
    ResolveOfflineStaffReviewRequest decision(String kind) { return new ResolveOfflineStaffReviewRequest(kind,version(),"Verified the original collection",new BigDecimal("100"),true,"CASH","RETURN-123",Instant.now()); }
    @Test void currentAdminPreservesHistoricalStaffEvidenceWithoutPostingOrChangingAssignment() {
        authorise(); UUID id=service.preserve(original,actor,"STAFF",admin);
        var saved=ArgumentCaptor.forClass(OfflineStaffReview.class);verify(reviews).saveAndFlush(saved.capture());
        assertThat(saved.getValue().getId()).isEqualTo(id); assertThat(saved.getValue().getRequestJson()).contains("original-signed-grant","PARTIAL_COLLECT");
        assertThat(saved.getValue().getStatus()).isEqualTo("PENDING");verifyNoInteractions(cash,requests);
        verify(users).verifyOfflineReviewer(any()); verify(audit).log(any());
    }
    @Test void rejectedReviewerCannotReadOriginalOrTouchFinancialState() {
        doThrow(new BusinessException(ErrorCode.FORBIDDEN)).when(users).verifyOfflineReviewer(any());
        assertThatThrownBy(()->service.preserve(original,actor,"STAFF",admin)).isInstanceOf(BusinessException.class);
        verifyNoInteractions(cash,requests,reviews,receipts,locks);
    }
    @Test void invalidHistoricalProofCannotReachStorage() {
        when(users.verifyOfflineHistoricalEvidence(any())).thenThrow(new BusinessException(ErrorCode.FORBIDDEN));
        assertThatThrownBy(()->service.preserve(original,actor,"STAFF",admin)).isInstanceOf(BusinessException.class);
        verifyNoInteractions(cash,requests,reviews,receipts,locks);
    }
    @Test void sameOperationCannotReplaceOriginalSnapshotOrAmount() {
        authorise(); when(reviews.findByTenantIdAndActorIdAndOperationId("org-a",actor,original.getOperationId())).thenReturn(Optional.of(review));
        assertThat(service.preserve(original,actor,"STAFF",admin)).isEqualTo(review.getId());
        original.setCollectionSnapshot(new OfflineStaffActionRequest.CollectionSnapshot(UUID.randomUUID(),request.getChitId(),new BigDecimal("200")));
        assertThatThrownBy(()->service.preserve(original,actor,"STAFF",admin)).isInstanceOf(BusinessException.class).hasMessageContaining("different details");
        verify(reviews,never()).saveAndFlush(any());
    }
    @Test void lostAcknowledgementIsRecoveredWithoutAnotherPickup() {
        authorise(); when(receipts.findByTenantIdAndActorIdAndOperationId("org-a",actor,original.getOperationId())).thenReturn(Optional.of(
                OfflineCommandReceipt.builder().payloadHash(review.getPayloadHash()).responseJson("{\"id\":\"existing\"}").build()));
        service.preserve(original,actor,"STAFF",admin);
        var saved=ArgumentCaptor.forClass(OfflineStaffReview.class);verify(reviews).saveAndFlush(saved.capture());
        assertThat(saved.getValue().getStatus()).isEqualTo("LINKED");assertThat(saved.getValue().getResolutionJson()).contains("existing");verifyNoInteractions(cash,requests);
    }
    @Test void restoredAssignedTaskRecordsOriginalCustodyAndReceiptWithoutCreditingMember() {
        resolving(); when(cash.partiallyCollect(request.getId(),new BigDecimal("100"),actor,"STAFF"))
            .thenReturn(CashRequestResponse.builder().id(request.getId()).status(CashRequestStatus.PARTIALLY_COLLECTED).build());
        assertThat(service.resolve(review.getId(),decision("RECORD_CUSTODY"),admin).get("status")).isEqualTo("RECORDED");
        var saved=ArgumentCaptor.forClass(OfflineCommandReceipt.class);verify(receipts).saveAndFlush(saved.capture());
        assertThat(saved.getValue().getActorId()).isEqualTo(actor);assertThat(saved.getValue().getPayloadHash()).isEqualTo(review.getPayloadHash());
        assertThat(saved.getValue().getRecordedAt()).isEqualTo(original.getRecordedAt());
        assertThat(request.getPickedUpAt()).isEqualTo(LocalDateTime.ofInstant(original.getRecordedAt(), ZoneOffset.UTC));
        assertThat(request.getPartiallyCollectedAt()).isEqualTo(request.getPickedUpAt());
        assertThat(saved.getValue().getResponseJson()).contains("2026-01-01T11:00:00"); verify(audit).log(any());
    }
    @Test void reassignmentCannotBeSilentlyOverwritten() {
        resolving();request.setAssignedStaffId(UUID.randomUUID());
        assertThatThrownBy(()->service.resolve(review.getId(),decision("RECORD_CUSTODY"),admin)).isInstanceOf(BusinessException.class).hasMessageContaining("Restore assignment");
        verifyNoInteractions(cash);verify(receipts,never()).saveAndFlush(any());
    }
    @Test void amountCannotBeChangedDuringReview() {
        resolving();var d=decision("RECORD_CUSTODY");
        var changed=new ResolveOfflineStaffReviewRequest(d.decision(),d.expectedVersion(),d.reason(),new BigDecimal("101"),true,null,null,null);
        assertThatThrownBy(()->service.resolve(review.getId(),changed,admin)).isInstanceOf(BusinessException.class).hasMessageContaining("original collected amount");verifyNoInteractions(cash);
    }
    @Test void changedMemberCannotReceiveOriginalCash() {
        resolving();request.setMemberId(UUID.randomUUID());
        assertThatThrownBy(()->service.resolve(review.getId(),decision("RECORD_CUSTODY"),admin)).isInstanceOf(BusinessException.class).hasMessageContaining("original member and chit");verifyNoInteractions(cash);
    }
    @Test void staleReviewCannotApplyOrCloseAnything() {
        resolving();var d=decision("CANCEL_MISTAKE");request.setUpdatedAt(request.getUpdatedAt().plusSeconds(1));
        assertThatThrownBy(()->service.resolve(review.getId(),d,admin)).isInstanceOf(BusinessException.class).hasMessageContaining("changed during review");verifyNoInteractions(cash);
    }
    @Test void linkingRequiresAnExplicitMatchingCustodyAndOriginalCollector() {
        resolving();request.setStatus(CashRequestStatus.PARTIALLY_COLLECTED);request.setPickedUpBy(actor);request.setCollectedAmount(new BigDecimal("100"));
        assertThat(service.resolve(review.getId(),decision("LINK_CUSTODY"),admin).get("status")).isEqualTo("LINKED");verifyNoInteractions(cash);
        verify(receipts).saveAndFlush(any());
    }
    @Test void anotherCollectorsPickupCannotBeLinked() {
        resolving();request.setStatus(CashRequestStatus.PICKED_UP);request.setPickedUpBy(UUID.randomUUID());request.setRequestedAmount(new BigDecimal("100"));
        assertThatThrownBy(()->service.resolve(review.getId(),decision("LINK_CUSTODY"),admin)).isInstanceOf(BusinessException.class).hasMessageContaining("does not match");verifyNoInteractions(cash);
    }
    @Test void cancellationRetainsEvidenceAndAdvancesOnlyTheMatchingTaskVersion() {
        resolving();var before=request.getUpdatedAt();
        assertThat(service.resolve(review.getId(),decision("CANCEL_MISTAKE"),admin).get("status")).isEqualTo("CANCELLED");
        assertThat(review.getRequestJson()).contains("original-signed-grant");
        assertThat(request.getUpdatedAt()).isAfter(before);assertThat(request.getStatus()).isEqualTo(CashRequestStatus.ASSIGNED);
        assertThat(request.getAssignedStaffId()).isEqualTo(actor);assertThat(request.getCollectedAmount()).isNull();assertThat(request.getPickedUpBy()).isNull();
        verifyNoInteractions(cash);verify(requests).saveAndFlush(request);verify(receipts,never()).saveAndFlush(any());
    }
    @Test void cancellationDoesNotChangeAnotherCollectorsCurrentTask() {
        resolving();request.setAssignedStaffId(UUID.randomUUID());var before=request.getUpdatedAt();
        assertThat(service.resolve(review.getId(),decision("CANCEL_MISTAKE"),admin).get("status")).isEqualTo("CANCELLED");
        assertThat(request.getUpdatedAt()).isEqualTo(before);verify(requests,never()).saveAndFlush(any());verifyNoInteractions(cash);
    }
    @Test void existingCustodyCannotBeDisguisedAsAnUncollectedMistakeOrUnpostedRefund() {
        resolving();request.setStatus(CashRequestStatus.PICKED_UP);request.setPickedUpBy(actor);
        for(String kind:List.of("CANCEL_MISTAKE","RECORD_REFUND")) assertThatThrownBy(()->service.resolve(review.getId(),decision(kind),admin))
            .isInstanceOf(BusinessException.class).hasMessageContaining("custody already exists");verifyNoInteractions(cash);
    }
    @Test void recordedRefundNeedsFullAmountAndCompletedEvidence() {
        resolving();assertThat(service.resolve(review.getId(),decision("RECORD_REFUND"),admin).get("status")).isEqualTo("REFUNDED");
        assertThat(review.getResolutionJson()).contains("RETURN-123");verifyNoInteractions(cash);verify(receipts,never()).saveAndFlush(any());
    }
    @Test void shortRefundAndFutureRefundCannotCloseReview() {
        resolving();
        for(var d:List.of(new ResolveOfflineStaffReviewRequest("RECORD_REFUND",version(),"Cash fully returned",new BigDecimal("50"),true,"CASH","ref",Instant.now()),
                new ResolveOfflineStaffReviewRequest("RECORD_REFUND",version(),"Cash fully returned",new BigDecimal("100"),true,"CASH","ref",Instant.now().plusSeconds(600)))) {
            assertThatThrownBy(()->service.resolve(review.getId(),d,admin)).isInstanceOf(BusinessException.class).hasMessageContaining("full returned amount");
        }
        verify(reviews,never()).saveAndFlush(any());verifyNoInteractions(cash);
    }
    @Test void ownerCanReadOnlyTheirOwnReviewAndCannotSeeSigningProof() {
        when(reviews.findByIdAndTenantId(review.getId(),"org-a")).thenReturn(Optional.of(review));
        assertThat(service.detail(review.getId(),actor,false).toString()).doesNotContain("original-signed-grant");
        assertThatThrownBy(()->service.detail(review.getId(),UUID.randomUUID(),false)).isInstanceOf(BusinessException.class);verifyNoInteractions(users,requests);
    }
    @Test void duplicateDecisionAfterLostAcknowledgementIsIdempotent() {
        resolving();var d=decision("CANCEL_MISTAKE");service.resolve(review.getId(),d,admin);clearInvocations(reviews,audit,cash,receipts);
        assertThat(service.resolve(review.getId(),d,admin).get("status")).isEqualTo("CANCELLED");
        verify(reviews,never()).saveAndFlush(any());verifyNoInteractions(audit,cash);verify(receipts,never()).saveAndFlush(any());
    }
}
