package com.chitfund.userservice.service;

import com.chitfund.common.exception.BusinessException;
import com.chitfund.userservice.client.AuditClient;
import com.chitfund.userservice.domain.entity.PlanPayment;
import com.chitfund.userservice.domain.entity.PlanReceipt;
import com.chitfund.userservice.domain.entity.ReceiptNumberSeq;
import com.chitfund.userservice.domain.entity.Tenant;
import com.chitfund.userservice.dto.request.RecordRefundRequest;
import com.chitfund.userservice.repository.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class BillingRefundIdempotencyTest {
    @Mock PlanPaymentRepository paymentRepo;
    @Mock PlanReceiptRepository receiptRepo;
    @Mock ReceiptNumberSeqRepository seqRepo;
    @Mock TenantRepository tenantRepo;
    @Mock PlanLimitsRepository planRepo;
    @Mock UserRepository userRepo;
    @Mock TenantCustomLimitsRepository customLimitsRepo;
    @Mock AuditClient auditClient;
    @InjectMocks BillingService billingService;

    @Test
    void sameRefundKeyAndRequestReturnsOriginalWithoutGeneratingAnotherReceipt() {
        Fixture fixture = fixture();
        when(receiptRepo.findByPaymentId(fixture.payment.getId()))
                .thenReturn(List.of(), List.of(fixture.refundReceipt));

        var first = billingService.recordRefund(fixture.payment.getId(), refund("refund-key", 4_000L), fixture.actorId);
        var replay = billingService.recordRefund(fixture.payment.getId(), refund("refund-key", 4_000L), fixture.actorId);

        assertThat(replay.getId()).isEqualTo(first.getId());
        assertThat(replay.getRefundAmountPaise()).isEqualTo(4_000L);
        verify(seqRepo, times(1)).save(any());
        verify(receiptRepo, times(1)).save(any());
        verify(auditClient, times(1)).log(
                eq("PLAN_PAYMENT"), eq(fixture.payment.getId()), eq("REFUND_RECORDED"),
                eq(fixture.actorId), eq("SUPER_ADMIN"), any(), any(),
                eq(fixture.payment.getTenantId()), eq("HUB"), eq("SUCCESS"),
                eq("Customer approved correction"), eq(fixture.payment.getId()),
                eq("refund-key"));
    }

    @Test
    void sameRefundKeyCannotBeReusedWithDifferentRequest() {
        Fixture fixture = fixture();
        billingService.recordRefund(fixture.payment.getId(), refund("refund-key", 4_000L), fixture.actorId);

        assertThatThrownBy(() -> billingService.recordRefund(
                fixture.payment.getId(), refund("refund-key", 3_000L), fixture.actorId))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("different refund request");
        verify(seqRepo, times(1)).save(any());
    }

    @Test
    void aDifferentKeyCannotRefundAnAlreadyRefundedPayment() {
        Fixture fixture = fixture();
        billingService.recordRefund(fixture.payment.getId(), refund("refund-key-1", 4_000L), fixture.actorId);

        assertThatThrownBy(() -> billingService.recordRefund(
                fixture.payment.getId(), refund("refund-key-2", 4_000L), fixture.actorId))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("already been refunded");
        verify(seqRepo, times(1)).save(any());
    }

    private Fixture fixture() {
        UUID tenantId = UUID.randomUUID();
        String actorId = UUID.randomUUID().toString();
        PlanPayment payment = PlanPayment.builder()
                .id(UUID.randomUUID().toString()).tenantId(tenantId.toString())
                .type("PURCHASE").status("COMPLETED").amountPaise(10_000L)
                .toPlan("BASIC").toPlanName("Basic")
                .planPeriodStart(LocalDate.now()).planPeriodEnd(LocalDate.now().plusDays(30))
                .paymentMethod("UPI").paymentDate(LocalDate.now()).createdBy(actorId).build();
        Tenant tenant = Tenant.builder().id(tenantId).name("Acme").plan("BASIC").build();
        ReceiptNumberSeq sequence = mock(ReceiptNumberSeq.class);
        when(sequence.getId()).thenReturn(1L);
        PlanReceipt refundReceipt = PlanReceipt.builder()
                .id(UUID.randomUUID().toString()).paymentId(payment.getId())
                .tenantId(tenantId.toString()).receiptNumber("CHW-REFUND-1")
                .type("REFUND").amountPaise(4_000L).build();

        when(paymentRepo.findByIdForUpdate(payment.getId())).thenReturn(Optional.of(payment));
        when(tenantRepo.findById(tenantId)).thenReturn(Optional.of(tenant));
        when(seqRepo.save(any())).thenReturn(sequence);
        when(receiptRepo.save(any())).thenReturn(refundReceipt);
        return new Fixture(payment, refundReceipt, actorId);
    }

    private static RecordRefundRequest refund(String key, long amount) {
        RecordRefundRequest request = new RecordRefundRequest();
        request.setRefundAmountPaise(amount);
        request.setRefundReason("Customer approved correction");
        request.setRefundMethod("UPI");
        request.setRefundDate(LocalDate.now());
        request.setIdempotencyKey(key);
        return request;
    }

    private record Fixture(PlanPayment payment, PlanReceipt refundReceipt, String actorId) {}
}
