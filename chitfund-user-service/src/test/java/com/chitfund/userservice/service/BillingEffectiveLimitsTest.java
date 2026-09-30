package com.chitfund.userservice.service;

import com.chitfund.userservice.domain.entity.*;
import com.chitfund.userservice.client.AuditClient;
import com.chitfund.userservice.dto.request.RecordPaymentRequest;
import com.chitfund.userservice.repository.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDate;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class BillingEffectiveLimitsTest {
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
    void purchaseRefreshesAnExistingEffectiveLimitsRow() {
        UUID tenantId = UUID.randomUUID();
        String actorId = UUID.randomUUID().toString();
        Tenant tenant = Tenant.builder().id(tenantId).name("Acme").plan("BASIC").build();
        PlanLimits growth = PlanLimits.builder()
                .plan("GROWTH").displayName("Growth").isActive(true)
                .maxActiveChits(20).maxMembers(500).maxStaff(10)
                .capabilities("[\"live_chat\"]")
                .allowedChitTypes("RESERVATION,AUCTION")
                .priceMonthlyInr(49900).build();
        TenantCustomLimits existing = TenantCustomLimits.builder()
                .tenantId(tenantId.toString()).planCode("BASIC")
                .maxActiveChits(1).maxMembers(20).maxStaff(0)
                .allowedChitTypes("RESERVATION").priceMonthlyInr(9900).build();
        RecordPaymentRequest request = new RecordPaymentRequest();
        request.setTenantId(tenantId.toString());
        request.setType("PURCHASE");
        request.setToPlan("GROWTH");
        request.setAmountPaise(49900L);
        request.setGrossAmountPaise(49900L);
        request.setPaymentMethod("UPI");
        request.setPaymentDate(LocalDate.now());
        request.setIdempotencyKey("billing-key-1");
        ReceiptNumberSeq sequence = mockSequence(1L);
        when(tenantRepo.findByIdForUpdate(tenantId)).thenReturn(Optional.of(tenant));
        when(planRepo.findById("GROWTH")).thenReturn(Optional.of(growth));
        when(paymentRepo.findByIdempotencyKey("billing-key-1")).thenReturn(Optional.empty());
        when(customLimitsRepo.findById(tenantId.toString())).thenReturn(Optional.of(existing));
        when(seqRepo.save(any())).thenReturn(sequence);
        when(receiptRepo.save(any())).thenAnswer(call -> call.getArgument(0));

        billingService.recordPayment(request, actorId);

        assertThat(existing.getPlanCode()).isEqualTo("GROWTH");
        assertThat(existing.getMaxActiveChits()).isEqualTo(20);
        assertThat(existing.getMaxMembers()).isEqualTo(500);
        assertThat(existing.getMaxStaff()).isEqualTo(10);
        verify(customLimitsRepo).save(existing);
    }

    @Test
    void sameBillingKeyAndRequestReturnsOriginalWithoutApplyingItTwice() {
        UUID tenantId = UUID.randomUUID();
        String actorId = UUID.randomUUID().toString();
        Tenant tenant = Tenant.builder().id(tenantId).name("Acme").plan("BASIC").build();
        PlanLimits basic = PlanLimits.builder()
                .plan("BASIC").displayName("Basic").isActive(true)
                .maxActiveChits(1).maxMembers(20).maxStaff(0)
                .allowedChitTypes("RESERVATION").priceMonthlyInr(9900).build();
        TenantCustomLimits limits = TenantCustomLimits.builder()
                .tenantId(tenantId.toString()).planCode("BASIC")
                .allowedChitTypes("RESERVATION").build();
        RecordPaymentRequest request = paymentRequest(tenantId, "same-key", 9900L);
        AtomicReference<PlanPayment> stored = new AtomicReference<>();
        ReceiptNumberSeq sequence = mockSequence(2L);
        when(tenantRepo.findByIdForUpdate(tenantId)).thenReturn(Optional.of(tenant));
        when(planRepo.findById("BASIC")).thenReturn(Optional.of(basic));
        when(paymentRepo.findByIdempotencyKey("same-key"))
                .thenAnswer(call -> Optional.ofNullable(stored.get()));
        when(paymentRepo.save(any())).thenAnswer(call -> {
            PlanPayment payment = call.getArgument(0);
            stored.set(payment);
            return payment;
        });
        when(customLimitsRepo.findById(tenantId.toString())).thenReturn(Optional.of(limits));
        when(seqRepo.save(any())).thenReturn(sequence);
        when(receiptRepo.save(any())).thenAnswer(call -> call.getArgument(0));

        var first = billingService.recordPayment(request, actorId);
        var replay = billingService.recordPayment(request, actorId);

        assertThat(replay.getId()).isEqualTo(first.getId());
        verify(paymentRepo, times(1)).save(any());
        verify(tenantRepo, times(1)).save(tenant);
        verify(seqRepo, times(1)).save(any());
        verify(auditClient, times(1)).log(
                org.mockito.ArgumentMatchers.eq("PLAN_PAYMENT"), any(),
                org.mockito.ArgumentMatchers.eq("PURCHASE_RECORDED"),
                org.mockito.ArgumentMatchers.eq(actorId),
                org.mockito.ArgumentMatchers.eq("SUPER_ADMIN"), any(), any(),
                org.mockito.ArgumentMatchers.eq(tenantId.toString()),
                org.mockito.ArgumentMatchers.eq("HUB"),
                org.mockito.ArgumentMatchers.eq("SUCCESS"),
                org.mockito.ArgumentMatchers.isNull(), any(),
                org.mockito.ArgumentMatchers.eq("same-key"));
    }

    @Test
    void billingKeyCannotBeReusedForDifferentAmounts() {
        UUID tenantId = UUID.randomUUID();
        String actorId = UUID.randomUUID().toString();
        Tenant tenant = Tenant.builder().id(tenantId).name("Acme").plan("BASIC").build();
        PlanLimits basic = PlanLimits.builder()
                .plan("BASIC").displayName("Basic").isActive(true)
                .maxActiveChits(1).maxMembers(20).maxStaff(0)
                .allowedChitTypes("RESERVATION").priceMonthlyInr(9900).build();
        TenantCustomLimits limits = TenantCustomLimits.builder()
                .tenantId(tenantId.toString()).planCode("BASIC")
                .allowedChitTypes("RESERVATION").build();
        AtomicReference<PlanPayment> stored = new AtomicReference<>();
        ReceiptNumberSeq sequence = mockSequence(3L);
        when(tenantRepo.findByIdForUpdate(tenantId)).thenReturn(Optional.of(tenant));
        when(planRepo.findById("BASIC")).thenReturn(Optional.of(basic));
        when(paymentRepo.findByIdempotencyKey("reused-key"))
                .thenAnswer(call -> Optional.ofNullable(stored.get()));
        when(paymentRepo.save(any())).thenAnswer(call -> {
            PlanPayment payment = call.getArgument(0);
            stored.set(payment);
            return payment;
        });
        when(customLimitsRepo.findById(tenantId.toString())).thenReturn(Optional.of(limits));
        when(seqRepo.save(any())).thenReturn(sequence);
        when(receiptRepo.save(any())).thenAnswer(call -> call.getArgument(0));

        billingService.recordPayment(paymentRequest(tenantId, "reused-key", 9900L), actorId);

        assertThatThrownBy(() -> billingService.recordPayment(
                paymentRequest(tenantId, "reused-key", 10900L), actorId))
                .isInstanceOf(com.chitfund.common.exception.BusinessException.class)
                .hasMessageContaining("different billing request");
        verify(paymentRepo, times(1)).save(any());
    }

    private static RecordPaymentRequest paymentRequest(UUID tenantId, String key, long amount) {
        RecordPaymentRequest request = new RecordPaymentRequest();
        request.setTenantId(tenantId.toString());
        request.setType("PURCHASE");
        request.setToPlan("BASIC");
        request.setAmountPaise(amount);
        request.setGrossAmountPaise(amount);
        request.setPaymentMethod("UPI");
        request.setPaymentDate(LocalDate.now());
        request.setIdempotencyKey(key);
        return request;
    }

    private static ReceiptNumberSeq mockSequence(long id) {
        ReceiptNumberSeq sequence = mock(ReceiptNumberSeq.class);
        when(sequence.getId()).thenReturn(id);
        return sequence;
    }
}
