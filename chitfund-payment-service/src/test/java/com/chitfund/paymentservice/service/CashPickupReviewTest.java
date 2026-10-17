package com.chitfund.paymentservice.service;

import com.chitfund.common.context.TenantContext;
import com.chitfund.common.exception.BusinessException;
import com.chitfund.paymentservice.client.*;
import com.chitfund.paymentservice.domain.CashPaymentRequest;
import com.chitfund.paymentservice.domain.enums.CashRequestStatus;
import com.chitfund.paymentservice.exception.OfflineReviewRequiredException;
import com.chitfund.paymentservice.kafka.PaymentEventPublisher;
import com.chitfund.paymentservice.repository.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.*;
import org.mockito.junit.jupiter.MockitoExtension;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class CashPickupReviewTest {
    @Mock CashPaymentRequestRepository requests;
    @Mock CashRequestAuditLogRepository history;
    @Mock PaymentService payments;
    @Mock NotificationService notifications;
    @Mock MemberServiceClient members;
    @Mock UserServiceClient users;
    @Mock PaymentEventPublisher events;
    @Mock PlanExpiryChecker expiry;
    @Mock AuditClient audit;
    @InjectMocks CashRequestService cash;
    CashPaymentRequest request;
    final UUID admin = UUID.randomUUID();
    @BeforeEach void setup() {
        TenantContext.set("org-a");
        request = CashPaymentRequest.builder().id(UUID.randomUUID()).tenantId("org-a").memberId(UUID.randomUUID())
                .chitId(UUID.randomUUID()).assignedStaffId(UUID.randomUUID()).pickedUpBy(UUID.randomUUID())
                .requestedAmount(new BigDecimal("1000")).status(CashRequestStatus.PICKED_UP)
                .pickedUpAt(LocalDateTime.parse("2026-10-15T12:00:00")).build();
        when(requests.findByIdAndTenantIdForUpdate(request.getId(), "org-a")).thenReturn(Optional.of(request));
    }
    @AfterEach void clear() { TenantContext.clear(); }
    @Test void staffCashWithClearedDuesIsPreservedForAdminReviewBeforeCrediting() {
        when(payments.offlineBalanceSnapshot(any(), eq(true))).thenReturn(new PaymentService.OfflineBalanceSnapshot(
                "current", BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO, true));
        doThrow(new OfflineReviewRequiredException(UUID.randomUUID())).when(payments).requireCashPickupReview(any(), any(), eq(request.getId()));
        assertThatThrownBy(() -> cash.collectForRequest(request.getId(), admin, "ADMIN")).isInstanceOf(OfflineReviewRequiredException.class);
        verify(payments, never()).collectCash(any(), any(), anyBoolean(), any(), anyBoolean());
        assertThat(request.getStatus()).isEqualTo(CashRequestStatus.PICKED_UP); verify(requests, never()).save(any());
    }
    @Test void changedPickupAmountCannotBeApprovedUsingAnOldReview() {
        when(payments.offlineBalanceSnapshot(any(), eq(true))).thenReturn(new PaymentService.OfflineBalanceSnapshot(
                "current", BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO, true));
        assertThatThrownBy(() -> cash.collectReviewedPickup(request.getId(), admin, new BigDecimal("500"), "current"))
                .isInstanceOf(BusinessException.class).hasMessageContaining("Pickup amount");
        verify(payments, never()).collectCash(any(), any(), anyBoolean(), any(), anyBoolean());
    }
    @Test void memberRejectionStillRequiresItsOwnExplicitOverride() {
        request.setMemberApproved(false); request.setMemberRejectionReason("No cash was collected");
        assertThatThrownBy(() -> cash.collectReviewedPickup(request.getId(), admin, request.getRequestedAmount(), "current"))
                .isInstanceOf(BusinessException.class).hasMessageContaining("Member rejected");
        verifyNoInteractions(payments);
    }
    @Test void linkingAnActualDuplicateClosesOnlyThePickupAndKeepsItsEvidence() {
        when(requests.findByIdAndTenantId(request.getId(), "org-a")).thenReturn(Optional.of(request));
        UUID receipt = UUID.randomUUID();
        cash.linkDuplicatePickup(request.getId(), request.getRequestedAmount(), admin, receipt, "Verified against original receipt");
        assertThat(request.getStatus()).isEqualTo(CashRequestStatus.CANCELLED);
        assertThat(request.getPickedUpAt()).isNotNull(); assertThat(request.getAdminNotes()).contains(receipt.toString());
        verifyNoInteractions(payments);
    }
}
