package com.chitfund.paymentservice.service;

import com.chitfund.common.context.TenantContext;
import com.chitfund.common.exception.*;
import com.chitfund.paymentservice.client.*;
import com.chitfund.paymentservice.domain.*;
import com.chitfund.paymentservice.domain.enums.CashRequestStatus;
import com.chitfund.paymentservice.dto.request.OfflineStaffActionRequest;
import com.chitfund.paymentservice.dto.response.CashRequestResponse;
import com.chitfund.paymentservice.repository.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.*;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import java.math.BigDecimal;
import java.time.*;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class OfflineStaffActionServiceTest {
    @Mock UserServiceClient users;
    @Mock CashRequestService cash;
    @Mock CashPaymentRequestRepository requests;
    @Mock OfflineCommandReceiptRepository receipts;
    @Mock AuditClient audit;
    @Mock FinancialCommandLock locks;
    @Mock OfflineStaffReviewRepository reviews;
    private OfflineStaffActionService service;
    private OfflineStaffActionRequest command;
    private CashPaymentRequest request;
    private final UUID actor = UUID.randomUUID();

    @BeforeEach void setup() {
        TenantContext.set("org-a");
        service = new OfflineStaffActionService(users, cash, requests, receipts,
                new ObjectMapper().findAndRegisterModules().disable(com.fasterxml.jackson.databind.SerializationFeature.WRITE_DATES_AS_TIMESTAMPS), audit, locks, reviews);
        command = new OfflineStaffActionRequest();
        command.setOperationId("operation-a");
        command.setRequestId(UUID.randomUUID());
        command.setAction("PARTIAL_COLLECT");
        command.setCollectedAmount(new BigDecimal("100.00"));
        command.setExpectedUpdatedAt(LocalDateTime.parse("2026-01-01T10:00:00"));
        command.setRecordedAt(Instant.parse("2026-01-01T11:00:00Z"));
        command.setOfflineAuthorization("historical-proof");
        request = CashPaymentRequest.builder().id(command.getRequestId()).tenantId("org-a")
                .updatedAt(command.getExpectedUpdatedAt()).build();
    }
    @AfterEach void clear() { TenantContext.clear(); }

    private void authorise() {
        when(users.verifyOfflineRecordedAction(any())).thenReturn("grant-a");
    }

    @Test void acceptedHistoricalCollectionStoresReceiptAndAuditTogether() {
        authorise();
        when(requests.findByIdAndTenantIdForUpdate(command.getRequestId(), "org-a")).thenReturn(Optional.of(request));
        when(cash.partiallyCollect(command.getRequestId(), command.getCollectedAmount(), actor, "STAFF"))
                .thenReturn(CashRequestResponse.builder().id(command.getRequestId())
                        .status(CashRequestStatus.PARTIALLY_COLLECTED).build());
        assertThat(service.apply(command, actor, "STAFF").get("id").asText()).isEqualTo(command.getRequestId().toString());
        var receipt = ArgumentCaptor.forClass(OfflineCommandReceipt.class);
        verify(receipts).saveAndFlush(receipt.capture());
        assertThat(receipt.getValue().getRecordedAt()).isEqualTo(command.getRecordedAt());
        assertThat(receipt.getValue().getTenantId()).isEqualTo("org-a");
        assertThat(receipt.getValue().getActorId()).isEqualTo(actor);
        assertThat(request.getPickedUpAt()).isEqualTo(LocalDateTime.ofInstant(command.getRecordedAt(), ZoneOffset.UTC));
        assertThat(request.getPartiallyCollectedAt()).isEqualTo(request.getPickedUpAt());
        assertThat(receipt.getValue().getResponseJson()).contains("2026-01-01T11:00:00");
        verify(audit).log(any(AuditClient.AuditDetails.class));
    }

    @Test void acknowledgementRetryReturnsOriginalReceiptEvenWhenTaskWasRemoved() {
        authorise();
        String hash = IdempotencyFingerprint.of(command.getRequestId(), command.getAction(),
                command.getCollectedAmount(), command.getExpectedUpdatedAt(), command.getRecordedAt(), "grant-a");
        when(receipts.findByTenantIdAndActorIdAndOperationId("org-a", actor, "operation-a"))
                .thenReturn(Optional.of(OfflineCommandReceipt.builder().payloadHash(hash)
                        .responseJson("{\"id\":\"original-receipt\",\"status\":\"PARTIALLY_COLLECTED\"}").build()));
        assertThat(service.apply(command, actor, "STAFF").get("id").asText()).isEqualTo("original-receipt");
        verifyNoInteractions(requests, cash, audit);
        verify(receipts, never()).saveAndFlush(any());
    }

    @Test void changedPickupIsAConflictAndNeverOverwritten() {
        authorise();
        when(requests.findByIdAndTenantIdForUpdate(command.getRequestId(), "org-a")).thenReturn(Optional.of(request));
        request.setUpdatedAt(command.getExpectedUpdatedAt().plusSeconds(1));
        assertThatThrownBy(() -> service.apply(command, actor, "STAFF"))
                .isInstanceOfSatisfying(BusinessException.class, error -> assertThat(error.getHttpStatus()).isEqualTo(HttpStatus.CONFLICT));
        verifyNoInteractions(cash, audit);
        verify(receipts, never()).saveAndFlush(any());
    }

    @Test void operationIdentityCannotBeReusedWithDifferentCollectionDetails() {
        authorise();
        when(receipts.findByTenantIdAndActorIdAndOperationId("org-a", actor, "operation-a"))
                .thenReturn(Optional.of(OfflineCommandReceipt.builder().payloadHash("different-payload").build()));
        assertThatThrownBy(() -> service.apply(command, actor, "STAFF"))
                .isInstanceOfSatisfying(BusinessException.class, error -> assertThat(error.getHttpStatus()).isEqualTo(HttpStatus.CONFLICT));
        verifyNoInteractions(cash, audit);
    }

    @Test void rejectedHistoricalAuthorityCannotReachFinancialState() {
        when(users.verifyOfflineRecordedAction(any()))
                .thenThrow(new BusinessException(ErrorCode.FORBIDDEN));
        assertThatThrownBy(() -> service.apply(command, actor, "STAFF")).isInstanceOf(BusinessException.class);
        verifyNoInteractions(requests, receipts, cash, audit);
    }

    @Test void missingVerificationCannotReachFinancialState() {
        assertThatThrownBy(() -> service.apply(command, actor, "STAFF")).isInstanceOf(BusinessException.class);
        verifyNoInteractions(requests, receipts, cash, audit);
    }
}
