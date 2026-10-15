package com.chitfund.paymentservice.service;

import com.chitfund.common.context.TenantContext;
import com.chitfund.common.exception.BusinessException;
import com.chitfund.paymentservice.client.ChitServiceClient;
import com.chitfund.paymentservice.client.UserServiceClient;
import com.chitfund.paymentservice.domain.PaymentIntimation;
import com.chitfund.paymentservice.domain.PaymentIntimationAuditLog;
import com.chitfund.paymentservice.domain.PaymentIntimationItem;
import com.chitfund.paymentservice.domain.enums.IntimationStatus;
import com.chitfund.paymentservice.domain.enums.PaymentMode;
import com.chitfund.paymentservice.dto.request.ApproveIntimationRequest;
import com.chitfund.paymentservice.dto.request.CreateIntimationRequest;
import com.chitfund.paymentservice.dto.request.RecordPaymentRequest;
import com.chitfund.paymentservice.dto.response.PaymentBatchResponse;
import com.chitfund.paymentservice.dto.response.IntimationResponse;
import com.chitfund.paymentservice.kafka.PaymentEventPublisher;
import com.chitfund.paymentservice.repository.PaymentIntimationAuditLogRepository;
import com.chitfund.paymentservice.repository.PaymentIntimationRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class PaymentIntimationServiceSafetyTest {

    @Mock PaymentIntimationRepository intimationRepository;
    @Mock PaymentIntimationAuditLogRepository auditLogRepository;
    @Mock PaymentService paymentService;
    @Mock PaymentEventPublisher eventPublisher;
    @Mock UserServiceClient userServiceClient;
    @Mock ChitServiceClient chitServiceClient;

    @AfterEach
    void clearTenant() {
        TenantContext.clear();
    }

    @Test
    void approvalRequiresEveryStoredItemExactlyOnce() {
        TenantContext.set("tenant-a");
        PaymentIntimation intimation = pendingIntimation(2);
        when(intimationRepository.findByIdAndTenantIdForUpdate(intimation.getId(), "tenant-a"))
                .thenReturn(Optional.of(intimation));

        ApproveIntimationRequest request = approvalFor(intimation.getItems().get(0));

        assertThatThrownBy(() -> service().approveIntimation(
                intimation.getId(), UUID.randomUUID(), request))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("every intimation item");

        verify(paymentService, never()).recordPayment(any(), any(), anyString());
    }

    @Test
    void approvalRecordsOneAtomicPaymentWithExplicitAllocationsAndStableKey() {
        TenantContext.set("tenant-a");
        PaymentIntimation intimation = pendingIntimation(2);
        when(intimationRepository.findByIdAndTenantIdForUpdate(intimation.getId(), "tenant-a"))
                .thenReturn(Optional.of(intimation));
        when(paymentService.recordPayment(any(), any(), anyString()))
                .thenAnswer(invocation -> PaymentBatchResponse.builder().id(UUID.randomUUID()).build());

        ApproveIntimationRequest request = approvalFor(intimation.getItems().toArray(PaymentIntimationItem[]::new));
        UUID adminId = UUID.randomUUID();
        service().approveIntimation(intimation.getId(), adminId, request);

        ArgumentCaptor<RecordPaymentRequest> payment = ArgumentCaptor.forClass(RecordPaymentRequest.class);
        ArgumentCaptor<String> key = ArgumentCaptor.forClass(String.class);
        verify(paymentService).recordPayment(payment.capture(), any(), key.capture());
        assertThat(key.getValue()).isEqualTo("INTIM:" + intimation.getId());
        assertThat(payment.getValue().getAmount()).isEqualByComparingTo("200.00");
        assertThat(payment.getValue().getPaymentMode()).isEqualTo(PaymentMode.UPI);
        assertThat(payment.getValue().getPaymentReference()).isEqualTo("UTR-123");
        assertThat(payment.getValue().getAllocations())
                .extracting(allocation -> allocation.getAmount())
                .containsExactlyInAnyOrder(new BigDecimal("100.00"), new BigDecimal("100.00"));
        assertThat(intimation.getItems())
                .extracting(PaymentIntimationItem::getPaymentBatchId)
                .containsOnly(intimation.getItems().get(0).getPaymentBatchId());
        assertThat(intimation.getStatus()).isEqualTo(IntimationStatus.APPROVED);

        // A client retry after the original commit is a read-only idempotent success.
        service().approveIntimation(intimation.getId(), adminId, request);
        verify(paymentService).recordPayment(any(), any(), anyString());
    }

    @Test
    void voidFailurePropagatesAndDoesNotClaimTheIntimationWasVoided() {
        TenantContext.set("tenant-a");
        PaymentIntimation intimation = pendingIntimation(2);
        intimation.setStatus(IntimationStatus.APPROVED);
        intimation.getItems().get(0).setPaymentBatchId(UUID.randomUUID().toString());
        intimation.getItems().get(1).setPaymentBatchId(UUID.randomUUID().toString());
        when(intimationRepository.findByIdAndTenantIdForUpdate(intimation.getId(), "tenant-a"))
                .thenReturn(Optional.of(intimation));
        doThrow(new BusinessException(com.chitfund.common.exception.ErrorCode.CONCURRENT_MODIFICATION,
                "linked payment cannot be reversed"))
                .when(paymentService).voidPayment(any(), any(), any());

        assertThatThrownBy(() -> service().voidIntimation(
                intimation.getId(), UUID.randomUUID(), "wrong payment"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("cannot be reversed");

        assertThat(intimation.getStatus()).isEqualTo(IntimationStatus.APPROVED);
        verify(intimationRepository, never()).save(intimation);
    }

    @Test
    void voidReversesSharedMultiChitPaymentOnlyOnce() {
        TenantContext.set("tenant-a");
        PaymentIntimation intimation = pendingIntimation(2);
        intimation.setStatus(IntimationStatus.APPROVED);
        String sharedBatchId = UUID.randomUUID().toString();
        intimation.getItems().forEach(item -> item.setPaymentBatchId(sharedBatchId));
        when(intimationRepository.findByIdAndTenantIdForUpdate(intimation.getId(), "tenant-a"))
                .thenReturn(Optional.of(intimation));

        service().voidIntimation(intimation.getId(), UUID.randomUUID(), "duplicate report");

        verify(paymentService, times(1)).voidPayment(any(), any(), any());
        assertThat(intimation.getStatus()).isEqualTo(IntimationStatus.VOIDED);
    }

    @Test
    void createRejectsCreditAndRequiresReferenceForElectronicPayment() {
        TenantContext.set("tenant-a");
        CreateIntimationRequest creditRequest = createRequest(PaymentMode.CREDIT, null);
        assertThatThrownBy(() -> service().createIntimation(UUID.randomUUID(), creditRequest))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("money the member actually paid");

        CreateIntimationRequest missingReference = createRequest(PaymentMode.UPI, " ");
        assertThatThrownBy(() -> service().createIntimation(UUID.randomUUID(), missingReference))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("Payment reference is required");
        verify(intimationRepository, never()).save(any());
    }

    @Test
    void responseEnrichmentIsTenantScopedAndToleratesMissingDisplayNames() {
        TenantContext.set("tenant-a");
        PaymentIntimation intimation = pendingIntimation(1);
        UUID actorId = UUID.randomUUID();
        intimation.setStatus(IntimationStatus.APPROVED);
        intimation.setApprovedBy(actorId.toString());
        when(intimationRepository.findByIdAndTenantId(intimation.getId(), "tenant-a"))
                .thenReturn(Optional.of(intimation));
        when(auditLogRepository.findByTenantIdAndIntimationIdOrderByPerformedAtAsc(
                "tenant-a", intimation.getId()))
                .thenReturn(List.of(PaymentIntimationAuditLog.builder()
                        .tenantId("tenant-a")
                        .intimationId(intimation.getId())
                        .action("APPROVED")
                        .toStatus("APPROVED")
                        .performedBy(actorId.toString())
                        .performedByRole("MANAGER")
                        .build()));
        when(userServiceClient.getUserName(actorId)).thenReturn(null);

        ChitServiceClient.ChitDto chit = new ChitServiceClient.ChitDto();
        chit.setName("Lakshmi Monthly Chit");
        UUID chitId = UUID.fromString(intimation.getItems().get(0).getChitId());
        when(chitServiceClient.getChit(chitId)).thenReturn(chit);

        IntimationResponse response = service().getById(intimation.getId());

        assertThat(response.getApprovedByName()).isNull();
        assertThat(response.getApprovedByRole()).isEqualTo("MANAGER");
        assertThat(response.getPaymentMode()).isEqualTo(PaymentMode.UPI);
        assertThat(response.getPaymentReference()).isEqualTo("UTR-123");
        assertThat(response.getItems().get(0).getChitName()).isEqualTo("Lakshmi Monthly Chit");
        verify(auditLogRepository).findByTenantIdAndIntimationIdOrderByPerformedAtAsc(
                "tenant-a", intimation.getId());
        verify(auditLogRepository, never()).findByIntimationIdOrderByPerformedAtAsc(anyString());
    }

    private PaymentIntimationService service() {
        return new PaymentIntimationService(
                intimationRepository, auditLogRepository, paymentService, eventPublisher,
                userServiceClient, chitServiceClient);
    }

    private PaymentIntimation pendingIntimation(int itemCount) {
        PaymentIntimation intimation = PaymentIntimation.builder()
                .id(UUID.randomUUID().toString())
                .tenantId("tenant-a")
                .memberId(UUID.randomUUID().toString())
                .status(IntimationStatus.PENDING)
                .paymentMode(PaymentMode.UPI)
                .paymentReference("UTR-123")
                .build();
        List<PaymentIntimationItem> items = java.util.stream.IntStream.range(0, itemCount)
                .mapToObj(index -> PaymentIntimationItem.builder()
                        .id(UUID.randomUUID().toString())
                        .intimation(intimation)
                        .chitId(UUID.randomUUID().toString())
                        .claimedAmount(new BigDecimal("100.00"))
                        .build())
                .toList();
        intimation.setItems(items);
        return intimation;
    }

    private ApproveIntimationRequest approvalFor(PaymentIntimationItem... items) {
        ApproveIntimationRequest request = new ApproveIntimationRequest();
        request.setItems(java.util.Arrays.stream(items).map(item -> {
            ApproveIntimationRequest.ApprovedItemRequest approved =
                    new ApproveIntimationRequest.ApprovedItemRequest();
            approved.setItemId(item.getId());
            approved.setApprovedAmount(item.getClaimedAmount());
            return approved;
        }).toList());
        return request;
    }

    private CreateIntimationRequest createRequest(PaymentMode mode, String reference) {
        CreateIntimationRequest request = new CreateIntimationRequest();
        request.setPaymentMode(mode);
        request.setPaymentReference(reference);
        CreateIntimationRequest.IntimationItemRequest item = new CreateIntimationRequest.IntimationItemRequest();
        item.setChitId(UUID.randomUUID());
        item.setClaimedAmount(new BigDecimal("100.00"));
        request.setItems(List.of(item));
        return request;
    }
}
