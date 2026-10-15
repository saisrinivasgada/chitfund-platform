package com.chitfund.paymentservice.service;

import com.chitfund.common.context.TenantContext;
import com.chitfund.paymentservice.client.AuditClient;
import com.chitfund.paymentservice.client.MemberServiceClient;
import com.chitfund.paymentservice.client.UserServiceClient;
import com.chitfund.paymentservice.domain.CashPaymentRequest;
import com.chitfund.paymentservice.dto.request.CreateCashRequestRequest;
import com.chitfund.paymentservice.kafka.PaymentEventPublisher;
import com.chitfund.paymentservice.repository.CashPaymentRequestRepository;
import com.chitfund.paymentservice.repository.CashRequestAuditLogRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class CashRequestCentralAuditTest {

    @Mock CashPaymentRequestRepository requestRepository;
    @Mock CashRequestAuditLogRepository localAuditRepository;
    @Mock PaymentService paymentService;
    @Mock NotificationService notificationService;
    @Mock MemberServiceClient memberServiceClient;
    @Mock UserServiceClient userServiceClient;
    @Mock PaymentEventPublisher eventPublisher;
    @Mock PlanExpiryChecker planExpiryChecker;
    @Mock AuditClient centralAuditClient;

    @AfterEach
    void clearTenant() {
        TenantContext.clear();
    }

    @Test
    void creationWritesLocalAndOrganizationActivityFacts() {
        TenantContext.set("tenant-a");
        UUID requestId = UUID.randomUUID();
        UUID memberId = UUID.randomUUID();
        UUID chitId = UUID.randomUUID();

        CreateCashRequestRequest input = new CreateCashRequestRequest();
        input.setChitId(chitId);
        input.setRequestedAmount(new BigDecimal("1250.00"));

        // Return the same managed aggregate from both repository calls without
        // depending on JPA lifecycle callbacks in this focused unit test.
        final CashPaymentRequest[] managed = new CashPaymentRequest[1];
        when(requestRepository.save(any(CashPaymentRequest.class))).thenAnswer(invocation -> {
            managed[0] = invocation.getArgument(0);
            managed[0].setId(requestId);
            return managed[0];
        });
        when(requestRepository.findByIdAndTenantId(requestId, "tenant-a"))
                .thenAnswer(invocation -> Optional.of(managed[0]));

        CashRequestService service = new CashRequestService(
                requestRepository,
                localAuditRepository,
                paymentService,
                notificationService,
                memberServiceClient,
                userServiceClient,
                eventPublisher,
                planExpiryChecker,
                centralAuditClient);

        service.createRequest(memberId, input);

        verify(localAuditRepository).save(any());
        ArgumentCaptor<AuditClient.AuditDetails> audit =
                ArgumentCaptor.forClass(AuditClient.AuditDetails.class);
        verify(centralAuditClient).log(audit.capture());
        assertThat(audit.getValue().entityType()).isEqualTo("CASH_REQUEST");
        assertThat(audit.getValue().entityId()).isEqualTo(requestId.toString());
        assertThat(audit.getValue().chitId()).isEqualTo(chitId.toString());
        assertThat(audit.getValue().action()).isEqualTo("CASH_REQUEST_CREATED");
        assertThat(audit.getValue().tenantId()).isEqualTo("tenant-a");
        assertThat(audit.getValue().actorId()).isEqualTo(memberId.toString());
        assertThat(audit.getValue().after()).isInstanceOf(Map.class);
        Map<?, ?> after = (Map<?, ?>) audit.getValue().after();
        assertThat(after.get("status")).isEqualTo("PENDING");
        assertThat(after.get("requestedAmount")).isEqualTo(new BigDecimal("1250.00"));
    }
}
