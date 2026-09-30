package com.chitfund.userservice.service;

import com.chitfund.userservice.client.AuditClient;
import com.chitfund.userservice.domain.entity.Tenant;
import com.chitfund.userservice.event.NotificationEventPublisher;
import com.chitfund.userservice.repository.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class TenantSuperAdminAuditTest {
    @Mock TenantRepository tenantRepository;
    @Mock UserRepository userRepository;
    @Mock MemberUserLinkRepository memberLinkRepository;
    @Mock TenantCustomLimitsRepository customLimitsRepository;
    @Mock PlanLimitsRepository planLimitsRepository;
    @Mock PlanCapabilityDefRepository capabilityDefRepository;
    @Mock PromotionRepository promotionRepository;
    @Mock PasswordEncoder passwordEncoder;
    @Mock PromotionService promotionService;
    @Mock NotificationEventPublisher notificationEventPublisher;
    @Mock AuditClient auditClient;
    @Mock ObjectMapper objectMapper;
    @Mock TenantCreditAdjustmentRepository creditAdjustmentRepository;
    @InjectMocks TenantService tenantService;

    @Test
    void suspensionAuditRecordsTheActingSuperAdmin() {
        UUID tenantId = UUID.randomUUID();
        Tenant tenant = Tenant.builder().id(tenantId).name("Acme").status("ACTIVE").build();
        when(tenantRepository.findById(tenantId)).thenReturn(Optional.of(tenant));

        tenantService.suspendTenant(tenantId, "owner-1");

        assertThat(tenant.getStatus()).isEqualTo("SUSPENDED");
        verify(auditClient).log(eq("TENANT"), eq(tenantId.toString()),
                eq("TENANT_SUSPENDED"), eq("owner-1"), eq("ROLE_SUPER_ADMIN"),
                any(), any(), eq(tenantId.toString()));
    }

    @Test
    void creditAuditRecordsTheActingSuperAdminAndBalances() {
        UUID tenantId = UUID.randomUUID();
        Tenant tenant = Tenant.builder().id(tenantId).name("Acme")
                .creditBalanceInr(new BigDecimal("100.00")).build();
        when(tenantRepository.findByIdForUpdate(tenantId)).thenReturn(Optional.of(tenant));
        when(tenantRepository.save(tenant)).thenReturn(tenant);

        when(creditAdjustmentRepository.findByIdempotencyKey("credit-key")).thenReturn(Optional.empty());
        when(creditAdjustmentRepository.save(any())).thenAnswer(call -> call.getArgument(0));

        tenantService.addCredit(tenantId, new BigDecimal("25.00"),
                "Service recovery credit", "credit-key", "owner-2");

        assertThat(tenant.getCreditBalanceInr()).isEqualByComparingTo("125.00");
        verify(auditClient).log(eq("TENANT_CREDIT_ADJUSTMENT"), any(),
                eq("CREDIT_ADDED"), eq("owner-2"), eq("ROLE_SUPER_ADMIN"),
                any(), any(), eq(tenantId.toString()), eq("HUB"), eq("SUCCESS"),
                eq("Service recovery credit"), any(), eq("credit-key"));
    }

    @Test
    void sameCreditAdjustmentKeyReturnsOriginalWithoutChangingBalanceTwice() {
        UUID tenantId = UUID.randomUUID();
        Tenant tenant = Tenant.builder().id(tenantId).name("Acme")
                .creditBalanceInr(new BigDecimal("100.00")).build();
        AtomicReference<com.chitfund.userservice.domain.entity.TenantCreditAdjustment> stored =
                new AtomicReference<>();
        when(tenantRepository.findByIdForUpdate(tenantId)).thenReturn(Optional.of(tenant));
        when(tenantRepository.save(tenant)).thenReturn(tenant);
        when(creditAdjustmentRepository.findByIdempotencyKey("same-credit-key"))
                .thenAnswer(call -> Optional.ofNullable(stored.get()));
        when(creditAdjustmentRepository.save(any())).thenAnswer(call -> {
            var adjustment = (com.chitfund.userservice.domain.entity.TenantCreditAdjustment) call.getArgument(0);
            stored.set(adjustment);
            return adjustment;
        });

        var first = tenantService.addCredit(tenantId, new BigDecimal("25.00"),
                "Service recovery credit", "same-credit-key", "owner-2");
        var replay = tenantService.addCredit(tenantId, new BigDecimal("25.00"),
                "Service recovery credit", "same-credit-key", "owner-2");

        assertThat(first.getCreditBalanceInr()).isEqualByComparingTo("125.00");
        assertThat(replay.getCreditBalanceInr()).isEqualByComparingTo("125.00");
        assertThat(tenant.getCreditBalanceInr()).isEqualByComparingTo("125.00");
        verify(tenantRepository, times(1)).save(tenant);
        verify(creditAdjustmentRepository, times(1)).save(any());
        verify(auditClient, times(1)).log(eq("TENANT_CREDIT_ADJUSTMENT"), any(),
                eq("CREDIT_ADDED"), eq("owner-2"), eq("ROLE_SUPER_ADMIN"),
                any(), any(), eq(tenantId.toString()), eq("HUB"), eq("SUCCESS"),
                eq("Service recovery credit"), any(), eq("same-credit-key"));
    }

    @Test
    void creditAdjustmentKeyCannotBeReusedForDifferentAmount() {
        UUID tenantId = UUID.randomUUID();
        Tenant tenant = Tenant.builder().id(tenantId).name("Acme")
                .creditBalanceInr(new BigDecimal("100.00")).build();
        AtomicReference<com.chitfund.userservice.domain.entity.TenantCreditAdjustment> stored =
                new AtomicReference<>();
        when(tenantRepository.findByIdForUpdate(tenantId)).thenReturn(Optional.of(tenant));
        when(tenantRepository.save(tenant)).thenReturn(tenant);
        when(creditAdjustmentRepository.findByIdempotencyKey("reused-credit-key"))
                .thenAnswer(call -> Optional.ofNullable(stored.get()));
        when(creditAdjustmentRepository.save(any())).thenAnswer(call -> {
            var adjustment = (com.chitfund.userservice.domain.entity.TenantCreditAdjustment) call.getArgument(0);
            stored.set(adjustment);
            return adjustment;
        });

        tenantService.addCredit(tenantId, new BigDecimal("25.00"),
                "Service recovery credit", "reused-credit-key", "owner-2");

        assertThatThrownBy(() -> tenantService.addCredit(tenantId, new BigDecimal("30.00"),
                "Service recovery credit", "reused-credit-key", "owner-2"))
                .isInstanceOf(com.chitfund.common.exception.BusinessException.class)
                .hasMessageContaining("different credit adjustment");
        assertThat(tenant.getCreditBalanceInr()).isEqualByComparingTo("125.00");
        verify(creditAdjustmentRepository, times(1)).save(any());
    }

    @Test
    void resumeAuditPreservesTheRealActorRole() {
        UUID tenantId = UUID.randomUUID();
        Tenant tenant = Tenant.builder().id(tenantId).name("Acme")
                .cancellationRequestedAt(LocalDateTime.now())
                .cancellationRequestedBy("admin-1").build();
        when(tenantRepository.findById(tenantId)).thenReturn(Optional.of(tenant));
        when(tenantRepository.save(tenant)).thenReturn(tenant);

        tenantService.resumeMembership(tenantId, "owner-1", "ROLE_SUPER_ADMIN");

        assertThat(tenant.getCancellationRequestedAt()).isNull();
        verify(auditClient).log(eq("TENANT"), eq(tenantId.toString()),
                eq("CANCELLATION_REVOKED"), eq("owner-1"), eq("ROLE_SUPER_ADMIN"),
                any(), any(), eq(tenantId.toString()));
    }

    @Test
    void deductionLocksTenantAndRejectsAmountAboveBalance() {
        UUID tenantId = UUID.randomUUID();
        Tenant tenant = Tenant.builder().id(tenantId).name("Acme")
                .creditBalanceInr(new BigDecimal("50.00")).build();
        when(tenantRepository.findByIdForUpdate(tenantId)).thenReturn(Optional.of(tenant));

        assertThatThrownBy(() -> tenantService.deductCredit(
                tenantId, new BigDecimal("75.00"), "Correction", "deduct-key", "owner-1"))
                .isInstanceOf(com.chitfund.common.exception.BusinessException.class)
                .hasMessageContaining("cannot exceed");

        assertThat(tenant.getCreditBalanceInr()).isEqualByComparingTo("50.00");
        verify(tenantRepository).findByIdForUpdate(tenantId);
    }
}
