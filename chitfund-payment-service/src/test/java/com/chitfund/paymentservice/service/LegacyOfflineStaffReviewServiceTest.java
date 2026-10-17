package com.chitfund.paymentservice.service;

import com.chitfund.common.context.TenantContext;
import com.chitfund.common.exception.*;
import com.chitfund.paymentservice.client.*;
import com.chitfund.paymentservice.domain.*;
import com.chitfund.paymentservice.domain.enums.CashRequestStatus;
import com.chitfund.paymentservice.dto.request.*;
import com.chitfund.paymentservice.dto.response.CashRequestResponse;
import com.chitfund.paymentservice.repository.*;
import com.fasterxml.jackson.databind.*;
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
class LegacyOfflineStaffReviewServiceTest {
    @Mock OfflineStaffReviewRepository reviews;
    @Mock OfflineCommandReceiptRepository receipts;
    @Mock CashPaymentRequestRepository requests;
    @Mock CashRequestService cash;
    @Mock UserServiceClient users;
    @Mock FinancialCommandLock locks;
    @Mock AuditClient audit;
    @Mock EntityManager entities;
    final ObjectMapper json = new ObjectMapper().findAndRegisterModules().disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
    final UUID actor=UUID.randomUUID(), admin=UUID.randomUUID(), requestId=UUID.randomUUID();
    final Instant reportedAt=Instant.parse("2026-01-02T11:00:00Z"), verifiedAt=Instant.parse("2026-01-01T11:00:00Z");
    OfflineStaffReviewService service;
    LegacyOfflineStaffActionRequest legacy;
    OfflineStaffReview review;
    CashPaymentRequest task;
    static String hash(String raw) throws Exception { return HexFormat.of().formatHex(java.security.MessageDigest.getInstance("SHA-256").digest(raw.getBytes(java.nio.charset.StandardCharsets.UTF_8))); }
    LegacyOfflineStaffActionRequest envelope(String raw,String action) throws Exception { return new LegacyOfflineStaffActionRequest("old-operation",action,reportedAt,raw,hash(raw)); }
    @BeforeEach void setup() throws Exception {
        TenantContext.set("org-a");service=new OfflineStaffReviewService(reviews,receipts,requests,cash,users,locks,audit,json,entities);
        legacy=envelope("{\"requestId\":\""+requestId+"\",\"collectedAmount\":100}","PARTIAL_COLLECT");
        task=CashPaymentRequest.builder().id(requestId).tenantId("org-a").memberId(UUID.randomUUID()).chitId(UUID.randomUUID())
            .assignedStaffId(actor).status(CashRequestStatus.ASSIGNED).requestedAmount(new BigDecimal("200")).updatedAt(LocalDateTime.now().minusDays(1)).build();
    }
    @AfterEach void clear(){TenantContext.clear();}
    void intake() {
        service.preserveLegacy(legacy,actor,"STAFF",admin);
        var saved=ArgumentCaptor.forClass(OfflineStaffReview.class);verify(reviews).saveAndFlush(saved.capture());review=saved.getValue();
        clearInvocations(reviews,audit,users,receipts);
    }
    void readReview() {
        when(reviews.findByIdAndTenantId(review.getId(),"org-a")).thenReturn(Optional.of(review));
        when(requests.findByIdAndTenantId(requestId,"org-a")).thenReturn(Optional.of(task));
    }
    ResolveOfflineStaffReviewRequest decision(String kind,boolean verified,Instant time,BigDecimal amount) {
        readReview();String version=(String)service.detail(review.getId(),admin,true).get("version");
        return new ResolveOfflineStaffReviewRequest(kind,version,"Verified the original physical collection",amount,true,"CASH","RETURN-OLD",Instant.now(),verified,time);
    }
    void lockTask(){when(requests.findByIdAndTenantIdForUpdate(requestId,"org-a")).thenReturn(Optional.of(task));}

    @Test void intakeKeepsExactOldBytesAndNeverAppliesCashOrManufacturesSigningAuthority() {
        UUID id=service.preserveLegacy(legacy,actor,"STAFF",admin);
        var saved=ArgumentCaptor.forClass(OfflineStaffReview.class);verify(reviews).saveAndFlush(saved.capture());
        assertThat(saved.getValue().getId()).isEqualTo(id);assertThat(saved.getValue().getLegacyPayloadJson()).isEqualTo(legacy.originalPayloadJson());
        assertThat(saved.getValue().getLegacyPayloadHash()).isEqualTo(legacy.originalPayloadHash());assertThat(saved.getValue().getStatus()).isEqualTo("PENDING");
        verifyNoInteractions(cash,requests);verify(receipts,never()).saveAndFlush(any());verify(users).verifyOfflineReviewer(any());verify(users,never()).verifyOfflineHistoricalEvidence(any());
    }
    @Test void corruptedPayloadHashCannotBecomeAReview() {
        var corrupt=new LegacyOfflineStaffActionRequest(legacy.operationId(),legacy.action(),reportedAt,legacy.originalPayloadJson(),"0".repeat(64));
        assertThatThrownBy(()->service.preserveLegacy(corrupt,actor,"STAFF",admin)).isInstanceOf(BusinessException.class).hasMessageContaining("saved identity");
        verifyNoInteractions(reviews,cash,requests,receipts);
    }
    @Test void nullOrUnreadableOldPayloadIsRejectedWithoutDiscardingOrPostingCash() throws Exception {
        for(String raw:List.of("null","[]","{bad")) {
            var malformed=envelope(raw,"MARK_PICKUP");
            assertThatThrownBy(()->service.preserveLegacy(malformed,actor,"STAFF",admin)).isInstanceOf(BusinessException.class);
        }
        verifyNoInteractions(cash,reviews,receipts);
    }
    @Test void signedEvidenceCannotBeRelabelledAsAnUnsignedRecord() throws Exception {
        legacy=envelope("{\"requestId\":\""+requestId+"\",\"collectedAmount\":100,\"offlineAuthorization\":\"invalid-grant\"}","PARTIAL_COLLECT");
        assertThatThrownBy(()->service.preserveLegacy(legacy,actor,"STAFF",admin)).isInstanceOf(BusinessException.class).hasMessageContaining("Signed records use signed recovery");
        verifyNoInteractions(cash,reviews,receipts);
    }
    @Test void duplicateIntakeCannotReplaceTheOriginalRawPayload() throws Exception {
        intake();when(reviews.findByTenantIdAndActorIdAndOperationId("org-a",actor,"old-operation")).thenReturn(Optional.of(review));
        legacy=envelope("{\"requestId\":\""+requestId+"\",\"collectedAmount\":101}","PARTIAL_COLLECT");
        assertThatThrownBy(()->service.preserveLegacy(legacy,actor,"STAFF",admin)).isInstanceOf(BusinessException.class).hasMessageContaining("original evidence");
        assertThat(review.getLegacyPayloadJson()).contains(":100}");verify(reviews,never()).saveAndFlush(any());verifyNoInteractions(cash);
    }
    @Test void custodyNeedsSeparateLegacyVerificationAndAnActualCollectionTime() {
        intake();
        for(var d:List.of(decision("RECORD_CUSTODY",false,verifiedAt,new BigDecimal("100")),decision("RECORD_CUSTODY",true,null,new BigDecimal("100")),
                decision("RECORD_CUSTODY",true,Instant.now().plusSeconds(600),new BigDecimal("100"))))
            assertThatThrownBy(()->service.resolve(review.getId(),d,admin)).isInstanceOf(BusinessException.class).hasMessageContaining("older unsigned record");
        verifyNoInteractions(cash);verify(receipts,never()).saveAndFlush(any());verify(requests,never()).findByIdAndTenantIdForUpdate(any(),any());
    }
    @Test void explicitLegacyReviewRecordsOnlyOriginalAmountAndUsesAdminVerifiedTime() {
        intake();lockTask();
        when(cash.partiallyCollect(requestId,new BigDecimal("100"),actor,"STAFF")).thenReturn(CashRequestResponse.builder().id(requestId).status(CashRequestStatus.PARTIALLY_COLLECTED).build());
        assertThat(service.resolve(review.getId(),decision("RECORD_CUSTODY",true,verifiedAt,new BigDecimal("100")),admin).get("status")).isEqualTo("RECORDED");
        assertThat(task.getPickedUpAt()).isEqualTo(LocalDateTime.ofInstant(verifiedAt,ZoneOffset.UTC));
        var saved=ArgumentCaptor.forClass(OfflineCommandReceipt.class);verify(receipts).saveAndFlush(saved.capture());
        assertThat(saved.getValue().getGrantId()).startsWith("legacy:").hasSize(36);assertThat(saved.getValue().getRecordedAt()).isEqualTo(verifiedAt);
        assertThat(review.getLegacyPayloadJson()).isEqualTo(legacy.originalPayloadJson());assertThat(review.getResolutionJson()).contains("legacyDetailsVerified","2026-01-01T11:00:00Z");
        verify(users,never()).verifyOfflineHistoricalEvidence(any());
    }
    @Test void knownOldAmountCannotBeChangedDuringReview() {
        intake();lockTask();
        assertThatThrownBy(()->service.resolve(review.getId(),decision("RECORD_CUSTODY",true,verifiedAt,new BigDecimal("101")),admin)).isInstanceOf(BusinessException.class).hasMessageContaining("cannot be changed");
        verifyNoInteractions(cash);verify(receipts,never()).saveAndFlush(any());
    }
    @Test void anUnknownOldFullAmountCannotAdoptTheCurrentTaskAmountSilently() throws Exception {
        legacy=envelope("{\"requestId\":\""+requestId+"\"}","MARK_PICKUP");intake();lockTask();
        readReview();assertThat(service.detail(review.getId(),admin,true).get("amount")).isNull();
        assertThatThrownBy(()->service.resolve(review.getId(),decision("RECORD_CUSTODY",true,verifiedAt,new BigDecimal("100")),admin)).isInstanceOf(BusinessException.class).hasMessageContaining("Requested amount changed");
        verifyNoInteractions(cash);verify(receipts,never()).saveAndFlush(any());
    }
    @Test void legacyCancellationDoesNotInventACollectionTimeOrPostMemberMoney() {
        intake();lockTask();
        assertThat(service.resolve(review.getId(),decision("CANCEL_MISTAKE",true,null,null),admin).get("status")).isEqualTo("CANCELLED");
        assertThat(task.getStatus()).isEqualTo(CashRequestStatus.ASSIGNED);verifyNoInteractions(cash);verify(receipts,never()).saveAndFlush(any());
    }
    @Test void legacyRefundRequiresTheFullAmountAndARealCollectionTime() {
        intake();lockTask();
        assertThat(service.resolve(review.getId(),decision("RECORD_REFUND",true,verifiedAt,new BigDecimal("100")),admin).get("status")).isEqualTo("REFUNDED");
        assertThat(review.getResolutionJson()).contains("RETURN-OLD","legacyDetailsVerified");verifyNoInteractions(cash);verify(receipts,never()).saveAndFlush(any());
    }
    @Test void aReassignedLegacyTaskCannotBeOverwrittenAndRawEvidenceIsNotReturned() {
        intake();lockTask();task.setAssignedStaffId(UUID.randomUUID());
        readReview();var detail=service.detail(review.getId(),admin,true);assertThat(detail.get("authorizationVerified")).isEqualTo(false);
        assertThat(detail).doesNotContainKeys("legacyPayloadJson","legacyPayloadHash","offlineAuthorization");
        assertThatThrownBy(()->service.resolve(review.getId(),decision("RECORD_CUSTODY",true,verifiedAt,new BigDecimal("100")),admin)).isInstanceOf(BusinessException.class).hasMessageContaining("Restore assignment");
        verifyNoInteractions(cash);verify(receipts,never()).saveAndFlush(any());verify(requests,never()).saveAndFlush(any());
    }
}
