package com.chitfund.paymentservice.controller;

import com.chitfund.common.exception.BusinessException;
import com.chitfund.paymentservice.client.MemberServiceClient;
import com.chitfund.paymentservice.dto.request.RecordPaymentRequest;
import com.chitfund.paymentservice.dto.response.PaymentBatchResponse;
import com.chitfund.paymentservice.service.PaymentService;
import com.chitfund.paymentservice.service.PayoutFinancialCommandService;
import org.junit.jupiter.api.Test;
import org.springframework.security.core.Authentication;
import java.time.Instant;
import java.util.UUID;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class OfflineRecordedPaymentControllerTest {
    @Test void historicalRouteRejectsMissingEvidenceBeforeAnyPaymentAttempt() {
        var payments = mock(PaymentService.class);
        var controller = new PaymentController(payments,mock(MemberServiceClient.class),mock(PayoutFinancialCommandService.class));
        var request = new RecordPaymentRequest();
        var auth = mock(Authentication.class);
        assertThatThrownBy(() -> controller.syncRecordedPayment(request,"saved",auth)).isInstanceOf(BusinessException.class);
        request.setOfflineAuthorization("original-proof");
        assertThatThrownBy(() -> controller.syncRecordedPayment(request,"saved",auth)).isInstanceOf(BusinessException.class);
        request.setRecordedAt(Instant.parse("2026-01-01T12:00:00Z")); request.setOfflineAuthorization(" ");
        assertThatThrownBy(() -> controller.syncRecordedPayment(request,"saved",auth)).isInstanceOf(BusinessException.class);
        verifyNoInteractions(payments,auth);
    }
    @Test void signedDeliveryKeepsOriginalActorOperationAndEvidence() {
        var payments = mock(PaymentService.class);
        var controller = new PaymentController(payments,mock(MemberServiceClient.class),mock(PayoutFinancialCommandService.class));
        var request = new RecordPaymentRequest(); request.setOfflineAuthorization("original-proof");
        request.setRecordedAt(Instant.parse("2026-01-01T12:00:00Z"));
        var auth = mock(Authentication.class); var actor = UUID.randomUUID(); when(auth.getPrincipal()).thenReturn(actor);
        var receipt = PaymentBatchResponse.builder().id(UUID.randomUUID()).build();
        when(payments.recordPayment(request,actor,"original-operation")).thenReturn(receipt);
        assertThat(controller.syncRecordedPayment(request,"original-operation",auth).getBody().getData()).isSameAs(receipt);
        verify(payments).recordPayment(request,actor,"original-operation");
        assertThat(request.getOfflineAuthorization()).isEqualTo("original-proof");
        assertThat(request.getRecordedAt()).isEqualTo(Instant.parse("2026-01-01T12:00:00Z"));
    }
}
