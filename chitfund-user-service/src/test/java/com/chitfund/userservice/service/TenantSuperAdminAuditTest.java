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

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
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
        when(tenantRepository.findById(tenantId)).thenReturn(Optional.of(tenant));
        when(tenantRepository.save(tenant)).thenReturn(tenant);

        tenantService.addCredit(tenantId, new BigDecimal("25.00"), "owner-2");

        assertThat(tenant.getCreditBalanceInr()).isEqualByComparingTo("125.00");
        verify(auditClient).log(eq("TENANT"), eq(tenantId.toString()),
                eq("CREDIT_ADDED"), eq("owner-2"), eq("ROLE_SUPER_ADMIN"),
                any(), any(), eq(tenantId.toString()));
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
}
