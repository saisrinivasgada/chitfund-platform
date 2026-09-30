package com.chitfund.userservice.service;

import com.chitfund.common.exception.BusinessException;
import com.chitfund.userservice.client.AuditClient;
import com.chitfund.userservice.domain.entity.PlanCapabilityDef;
import com.chitfund.userservice.domain.entity.PlanLimits;
import com.chitfund.userservice.domain.entity.TenantCustomLimits;
import com.chitfund.userservice.dto.request.CreateCapabilityDefRequest;
import com.chitfund.userservice.dto.request.CreatePlanRequest;
import com.chitfund.userservice.dto.request.UpdatePlanRequest;
import com.chitfund.userservice.repository.PlanCapabilityDefRepository;
import com.chitfund.userservice.repository.PlanLimitsRepository;
import com.chitfund.userservice.repository.TenantCustomLimitsRepository;
import com.chitfund.userservice.repository.TenantDiscountRepository;
import com.chitfund.userservice.repository.TenantRepository;
import com.chitfund.userservice.repository.UserRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class PlanServiceAuditTest {

    @Mock PlanLimitsRepository planRepo;
    @Mock PlanCapabilityDefRepository capabilityRepo;
    @Mock TenantDiscountRepository discountRepo;
    @Mock TenantCustomLimitsRepository customLimitsRepo;
    @Mock TenantRepository tenantRepository;
    @Mock UserRepository userRepository;
    @Mock AuditClient auditClient;
    PlanService service;

    @BeforeEach
    void setUp() {
        service = new PlanService(planRepo, capabilityRepo, discountRepo, customLimitsRepo,
                tenantRepository, userRepository, new ObjectMapper(), auditClient);
    }

    @Test
    void newCapabilityIsOnlyCataloguedAndAuditedNotGrantedToPlans() {
        CreateCapabilityDefRequest request = new CreateCapabilityDefRequest();
        request.setLabel("Advanced Collections");
        when(capabilityRepo.findAllByOrderBySortOrderAscLabelAsc()).thenReturn(List.of());
        when(capabilityRepo.save(any())).thenAnswer(call -> call.getArgument(0));

        var created = service.addCapabilityDef(request, "owner-1");

        assertThat(created.getKey()).isEqualTo("advanced_collections");
        verify(planRepo, never()).save(any());
        verify(customLimitsRepo, never()).save(any());
        verify(auditClient).log(eq("CAPABILITY"), eq("advanced_collections"), eq("CREATED"),
                eq("owner-1"), eq("SUPER_ADMIN"),
                org.mockito.ArgumentMatchers.isNull(), any(), eq("PLATFORM"));
    }

    @Test
    void assignedCapabilityCannotBeDeletedAndLeftInvisibleButEnabled() {
        String key = "live_chat";
        when(capabilityRepo.findById(key)).thenReturn(Optional.of(
                PlanCapabilityDef.builder().key(key).label("Live Chat").sortOrder(1).build()));
        when(planRepo.findAll()).thenReturn(List.of(
                PlanLimits.builder().plan("GROWTH").capabilities("[\"live_chat\"]").build()));

        assertThatThrownBy(() -> service.deleteCapabilityDef(key, "owner-1"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("every standard and custom plan");

        verify(capabilityRepo, never()).delete(any());
        verifyNoInteractions(auditClient);
    }

    @Test
    void planCreationRecordsTheOwnerWhoChangedTheCatalog() {
        CreatePlanRequest request = new CreatePlanRequest();
        request.setPlan("FIELD");
        request.setDisplayName("Field Plan");
        request.setEnabledCapabilities(List.of("cash_pickups"));
        when(capabilityRepo.findAllById(List.of("cash_pickups"))).thenReturn(List.of(
                PlanCapabilityDef.builder().key("cash_pickups").label("Cash Pickups").build()));
        when(planRepo.save(any())).thenAnswer(call -> call.getArgument(0));

        var created = service.createPlan(request, "owner-1");

        assertThat(created.getPlan()).isEqualTo("FIELD");
        verify(auditClient).log(eq("PLAN"), eq("FIELD"), eq("CREATED"),
                eq("owner-1"), eq("SUPER_ADMIN"),
                org.mockito.ArgumentMatchers.isNull(), any(), eq("PLATFORM"));
    }

    @Test
    void unknownCapabilityIsRejectedInsteadOfAccidentallyGranted() {
        CreatePlanRequest request = new CreatePlanRequest();
        request.setPlan("BROKEN");
        request.setDisplayName("Broken Plan");
        request.setEnabledCapabilities(List.of("unknown_future_feature"));
        when(capabilityRepo.findAllById(List.of("unknown_future_feature"))).thenReturn(List.of());

        assertThatThrownBy(() -> service.createPlan(request, "owner-1"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("Unknown capability keys");

        verify(planRepo, never()).save(any());
        verifyNoInteractions(auditClient);
    }

    @Test
    void unsupportedLegacyChitTypeCannotBeWrittenToANewPlan() {
        CreatePlanRequest request = new CreatePlanRequest();
        request.setPlan("BROKEN_TYPES");
        request.setDisplayName("Broken Types");
        request.setAllowedChitTypes("RESERVATION,FLEXI");

        assertThatThrownBy(() -> service.createPlan(request, "owner-1"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("Unsupported chit types: FLEXI");

        verify(planRepo, never()).save(any());
        verifyNoInteractions(auditClient);
    }

    @Test
    void standardPlanEditPropagatesToExistingTenantEffectiveLimits() {
        PlanLimits growth = PlanLimits.builder()
                .plan("GROWTH").displayName("Growth").isActive(true)
                .maxActiveChits(5).maxMembers(100).maxStaff(3)
                .capabilities("[\"live_chat\"]")
                .allowedChitTypes("RESERVATION").priceMonthlyInr(39900).build();
        TenantCustomLimits tenantLimits = TenantCustomLimits.builder()
                .tenantId("tenant-1").planCode("GROWTH")
                .maxActiveChits(5).maxMembers(100).maxStaff(3)
                .capabilities("[\"live_chat\"]")
                .allowedChitTypes("RESERVATION").priceMonthlyInr(39900).build();
        UpdatePlanRequest request = new UpdatePlanRequest();
        request.setMaxMembers(250);
        request.setMaxStaff(8);
        request.setAllowedChitTypes("reservation, auction");
        when(planRepo.findById("GROWTH")).thenReturn(Optional.of(growth));
        when(planRepo.save(growth)).thenReturn(growth);
        when(customLimitsRepo.findAllByPlanCode("GROWTH")).thenReturn(List.of(tenantLimits));

        service.updatePlan("growth", request, "owner-1");

        assertThat(tenantLimits.getMaxMembers()).isEqualTo(250);
        assertThat(tenantLimits.getMaxStaff()).isEqualTo(8);
        assertThat(tenantLimits.getAllowedChitTypes()).isEqualTo("RESERVATION,AUCTION");
        verify(customLimitsRepo).save(tenantLimits);
        verify(auditClient).log(eq("TENANT"), eq("tenant-1"),
                eq("PLAN_DEFAULTS_APPLIED"), eq("owner-1"), eq("SUPER_ADMIN"),
                any(), any(), eq("tenant-1"), any(String.class));
    }
}
