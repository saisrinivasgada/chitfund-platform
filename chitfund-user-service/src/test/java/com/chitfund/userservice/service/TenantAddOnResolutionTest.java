package com.chitfund.userservice.service;

import com.chitfund.userservice.domain.entity.PlanLimits;
import com.chitfund.userservice.domain.entity.Tenant;
import com.chitfund.userservice.domain.entity.TenantCustomLimits;
import com.chitfund.userservice.repository.PlanLimitsRepository;
import com.chitfund.userservice.repository.TenantCustomLimitsRepository;
import com.chitfund.userservice.repository.TenantRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.Spy;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class TenantAddOnResolutionTest {
    @Mock TenantRepository tenantRepository;
    @Mock TenantCustomLimitsRepository customLimitsRepository;
    @Mock PlanLimitsRepository planLimitsRepository;
    @Spy ObjectMapper objectMapper = new ObjectMapper();
    @InjectMocks TenantService service;

    @Test
    void namedPlanUsesCurrentPlanSelectionsInsteadOfCopiedTenantSelections() {
        UUID id = UUID.randomUUID();
        when(tenantRepository.findById(id)).thenReturn(Optional.of(
                Tenant.builder().id(id).plan("GROWTH").build()));
        when(planLimitsRepository.findById("GROWTH")).thenReturn(Optional.of(
                PlanLimits.builder().plan("GROWTH").addOns("[\"live_chat\",\"settlement\"]").build()));

        assertThat(service.resolveAddOnsForTenant(id.toString()))
                .containsExactly("live_chat", "settlement");
        verifyNoInteractions(customLimitsRepository);
    }

    @Test
    void customPlanUsesOnlyItsOwnOrganisationSelections() {
        UUID id = UUID.randomUUID();
        when(tenantRepository.findById(id)).thenReturn(Optional.of(
                Tenant.builder().id(id).plan("CUSTOM").build()));
        when(customLimitsRepository.findById(id.toString())).thenReturn(Optional.of(
                TenantCustomLimits.builder().tenantId(id.toString())
                        .addOns("[\"priority_support\"]").build()));

        assertThat(service.resolveAddOnsForTenant(id.toString())).containsExactly("priority_support");
        verifyNoInteractions(planLimitsRepository);
    }

    @Test
    void missingOrganisationHasNoAddOns() {
        UUID id = UUID.randomUUID();
        when(tenantRepository.findById(id)).thenReturn(Optional.empty());
        assertThat(service.resolveAddOnsForTenant(id.toString())).isEmpty();
        verifyNoInteractions(planLimitsRepository, customLimitsRepository);
    }
}
