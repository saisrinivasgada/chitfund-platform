package com.chitfund.userservice.service;

import com.chitfund.common.exception.BusinessException;
import com.chitfund.userservice.client.AuditClient;
import com.chitfund.userservice.domain.entity.PlanLimits;
import com.chitfund.userservice.domain.entity.Tenant;
import com.chitfund.userservice.domain.entity.TenantCustomLimits;
import com.chitfund.userservice.event.NotificationEventPublisher;
import com.chitfund.userservice.repository.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class TenantPlanAssignmentTest {
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
    void planAssignmentUpdatesTenantAndEffectiveLimitsTogether() {
        UUID tenantId = UUID.randomUUID();
        Tenant tenant = Tenant.builder().id(tenantId).plan("BASIC").build();
        PlanLimits growth = PlanLimits.builder()
                .plan("GROWTH").displayName("Growth").isActive(true)
                .maxActiveChits(20).maxMembers(500).maxStaff(10)
                .capabilities("[\"live_chat\"]")
                .allowedChitTypes("RESERVATION,AUCTION")
                .priceMonthlyInr(49900).build();
        when(tenantRepository.findById(tenantId)).thenReturn(Optional.of(tenant));
        when(planLimitsRepository.findById("GROWTH")).thenReturn(Optional.of(growth));
        when(customLimitsRepository.findById(tenantId.toString())).thenReturn(Optional.empty());
        when(tenantRepository.save(any())).thenAnswer(call -> call.getArgument(0));
        when(customLimitsRepository.save(any())).thenAnswer(call -> call.getArgument(0));

        tenantService.updatePlan(tenantId, " growth ", "owner-1");

        assertThat(tenant.getPlan()).isEqualTo("GROWTH");
        ArgumentCaptor<TenantCustomLimits> limitsCaptor = ArgumentCaptor.forClass(TenantCustomLimits.class);
        verify(customLimitsRepository).save(limitsCaptor.capture());
        TenantCustomLimits saved = limitsCaptor.getValue();
        assertThat(saved.getPlanCode()).isEqualTo("GROWTH");
        assertThat(saved.getMaxActiveChits()).isEqualTo(20);
        assertThat(saved.getMaxMembers()).isEqualTo(500);
        assertThat(saved.getMaxStaff()).isEqualTo(10);
        assertThat(saved.getCapabilities()).isEqualTo("[\"live_chat\"]");
        assertThat(saved.getAllowedChitTypes()).isEqualTo("RESERVATION,AUCTION");
        verify(auditClient).log(org.mockito.ArgumentMatchers.eq("TENANT"),
                org.mockito.ArgumentMatchers.eq(tenantId.toString()),
                org.mockito.ArgumentMatchers.eq("PLAN_CHANGED"),
                org.mockito.ArgumentMatchers.eq("owner-1"),
                org.mockito.ArgumentMatchers.eq("ROLE_SUPER_ADMIN"),
                any(), any(), org.mockito.ArgumentMatchers.eq(tenantId.toString()));
    }

    @Test
    void inactiveOrUnknownPlanCannotBeAssigned() {
        UUID tenantId = UUID.randomUUID();
        Tenant tenant = Tenant.builder().id(tenantId).plan("BASIC").build();
        PlanLimits inactive = PlanLimits.builder().plan("RETIRED").isActive(false).build();
        when(tenantRepository.findById(tenantId)).thenReturn(Optional.of(tenant));
        when(planLimitsRepository.findById("RETIRED")).thenReturn(Optional.of(inactive));

        assertThatThrownBy(() -> tenantService.updatePlan(tenantId, "retired", "owner-1"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("Active plan not found");

        verify(tenantRepository, never()).save(any());
        verify(customLimitsRepository, never()).save(any());
    }

    @Test
    void effectiveLimitsCarryTheCurrentTenantStatus() {
        UUID tenantId = UUID.randomUUID();
        Tenant tenant = Tenant.builder().id(tenantId).plan("GROWTH").status("SUSPENDED").build();
        TenantCustomLimits limits = TenantCustomLimits.builder()
                .tenantId(tenantId.toString()).planCode("GROWTH")
                .maxActiveChits(5).maxMembers(100).maxStaff(3)
                .allowedChitTypes("RESERVATION").build();
        when(customLimitsRepository.findById(tenantId.toString())).thenReturn(Optional.of(limits));
        when(tenantRepository.findById(tenantId)).thenReturn(Optional.of(tenant));
        when(planLimitsRepository.findById("GROWTH")).thenReturn(Optional.empty());

        var response = tenantService.getEffectiveLimits(tenantId.toString());

        assertThat(response.getTenantStatus()).isEqualTo("SUSPENDED");
        assertThat(response.getMaxMembers()).isEqualTo(100);
    }
}
