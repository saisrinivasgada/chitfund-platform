package com.chitfund.userservice.service;

import com.chitfund.userservice.client.AuditClient;
import com.chitfund.userservice.domain.entity.PlanLimits;
import com.chitfund.userservice.domain.entity.Tenant;
import com.chitfund.userservice.domain.enums.Role;
import com.chitfund.userservice.repository.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class StaffPlanLimitLockTest {

    @Mock PlanLimitsRepository planRepo;
    @Mock PlanCapabilityDefRepository capabilityRepo;
    @Mock TenantDiscountRepository discountRepo;
    @Mock TenantCustomLimitsRepository customLimitsRepo;
    @Mock TenantRepository tenantRepository;
    @Mock UserRepository userRepository;
    @Mock ObjectMapper objectMapper;
    @Mock AuditClient auditClient;

    @InjectMocks PlanService planService;

    @Test
    void tenantRowIsLockedBeforeTheStaffCountIsRead() {
        UUID tenantId = UUID.randomUUID();
        Tenant tenant = Tenant.builder().id(tenantId).plan("GROWTH").build();
        PlanLimits limits = PlanLimits.builder()
                .plan("GROWTH")
                .displayName("Growth")
                .maxStaff(5)
                .build();
        when(tenantRepository.findByIdForUpdate(tenantId)).thenReturn(Optional.of(tenant));
        when(planRepo.findById("GROWTH")).thenReturn(Optional.of(limits));
        when(userRepository.countByTenantIdAndRoleInAndDeletedAtIsNullAndEnabledTrue(
                tenantId.toString(), List.of(Role.MANAGER, Role.STAFF))).thenReturn(4L);

        planService.checkStaffLimit(tenantId.toString());

        var order = inOrder(tenantRepository, userRepository);
        order.verify(tenantRepository).findByIdForUpdate(tenantId);
        order.verify(userRepository).countByTenantIdAndRoleInAndDeletedAtIsNullAndEnabledTrue(
                tenantId.toString(), List.of(Role.MANAGER, Role.STAFF));
    }
}
