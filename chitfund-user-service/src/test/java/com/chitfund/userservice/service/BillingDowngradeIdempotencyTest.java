package com.chitfund.userservice.service;

import com.chitfund.common.exception.BusinessException;
import com.chitfund.userservice.client.AuditClient;
import com.chitfund.userservice.domain.entity.*;
import com.chitfund.userservice.repository.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class BillingDowngradeIdempotencyTest {
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
    void retryReturnsOriginalDowngradeWithoutReturningCreditTwice() {
        UUID tenantId = UUID.randomUUID();
        String actorId = UUID.randomUUID().toString();
        Tenant tenant = Tenant.builder().id(tenantId).name("Acme").plan("GROWTH")
                .planExpiresAt(LocalDateTime.now().plusDays(20))
                .creditBalanceInr(BigDecimal.ZERO).build();
        PlanLimits growth = plan("GROWTH", "Growth", 30_000L, true);
        PlanLimits basic = plan("BASIC", "Basic", 5_000L, true);
        TenantCustomLimits limits = TenantCustomLimits.builder()
                .tenantId(tenantId.toString()).planCode("GROWTH")
                .priceMonthlyInr(30_000L).build();
        AtomicReference<PlanPayment> stored = new AtomicReference<>();
        ReceiptNumberSeq sequence = mock(ReceiptNumberSeq.class);
        when(sequence.getId()).thenReturn(1L);
        when(tenantRepo.findByIdForUpdate(tenantId)).thenReturn(Optional.of(tenant));
        when(tenantRepo.findById(tenantId)).thenReturn(Optional.of(tenant));
        when(planRepo.findById("GROWTH")).thenReturn(Optional.of(growth));
        when(planRepo.findById("BASIC")).thenReturn(Optional.of(basic));
        when(customLimitsRepo.findById(tenantId.toString())).thenReturn(Optional.of(limits));
        when(paymentRepo.findByIdempotencyKey("down-key"))
                .thenAnswer(call -> Optional.ofNullable(stored.get()));
        when(paymentRepo.save(any())).thenAnswer(call -> {
            PlanPayment payment = call.getArgument(0);
            stored.set(payment);
            return payment;
        });
        when(seqRepo.save(any())).thenReturn(sequence);
        when(receiptRepo.save(any())).thenAnswer(call -> call.getArgument(0));

        var first = billingService.applyDowngrade(tenantId.toString(), "BASIC",
                "Lower operating needs", "down-key", actorId);
        BigDecimal balanceAfterFirst = tenant.getCreditBalanceInr();
        var replay = billingService.applyDowngrade(tenantId.toString(), "BASIC",
                "Lower operating needs", "down-key", actorId);

        assertThat(replay.getId()).isEqualTo(first.getId());
        assertThat(tenant.getCreditBalanceInr()).isEqualByComparingTo(balanceAfterFirst);
        verify(paymentRepo, times(1)).save(any());
        verify(seqRepo, times(1)).save(any());
        verify(auditClient, times(1)).log(eq("PLAN_PAYMENT"), any(),
                eq("DOWNGRADE_RECORDED"), eq(actorId), eq("ADMIN"),
                any(), any(), eq(tenantId.toString()), eq("HUB"), eq("SUCCESS"),
                eq("Lower operating needs"), any(), eq("down-key"));
    }

    @Test
    void inactiveTargetPlanCannotReceiveADowngrade() {
        UUID tenantId = UUID.randomUUID();
        Tenant tenant = Tenant.builder().id(tenantId).plan("GROWTH").build();
        when(tenantRepo.findByIdForUpdate(tenantId)).thenReturn(Optional.of(tenant));
        when(planRepo.findById("BASIC")).thenReturn(Optional.of(plan("BASIC", "Basic", 5_000L, false)));

        assertThatThrownBy(() -> billingService.applyDowngrade(tenantId.toString(), "BASIC",
                "Lower operating needs", "down-key", UUID.randomUUID().toString()))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("not available");
        verifyNoInteractions(auditClient);
    }

    private static PlanLimits plan(String code, String name, long price, boolean active) {
        return PlanLimits.builder().plan(code).displayName(name).priceMonthlyInr(price)
                .isActive(active).maxActiveChits(5).maxMembers(100).maxStaff(3)
                .allowedChitTypes("RESERVATION").build();
    }
}
