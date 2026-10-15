package com.chitfund.userservice.service;

import com.chitfund.common.exception.BusinessException;
import com.chitfund.userservice.client.AuditClient;
import com.chitfund.userservice.domain.entity.PlanAddOnDef;
import com.chitfund.userservice.domain.entity.PlanLimits;
import com.chitfund.userservice.domain.entity.TenantCustomLimits;
import com.chitfund.userservice.dto.request.CreateAddOnDefRequest;
import com.chitfund.userservice.dto.request.CreatePlanRequest;
import com.chitfund.userservice.dto.request.UpdatePlanRequest;
import com.chitfund.userservice.dto.request.SetTenantDiscountRequest;
import com.chitfund.userservice.domain.entity.Tenant;
import com.chitfund.userservice.repository.PlanAddOnDefRepository;
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
import java.math.BigDecimal;
import java.util.UUID;

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
    @Mock PlanAddOnDefRepository addOnRepo;
    @Mock TenantDiscountRepository discountRepo;
    @Mock TenantCustomLimitsRepository customLimitsRepo;
    @Mock TenantRepository tenantRepository;
    @Mock UserRepository userRepository;
    @Mock AuditClient auditClient;
    PlanService service;

    @BeforeEach
    void setUp() {
        service = new PlanService(planRepo, addOnRepo, discountRepo, customLimitsRepo,
                tenantRepository, userRepository, new ObjectMapper(), auditClient);
    }

    @Test
    void newAddOnIsOnlyCataloguedAndAuditedNotGrantedToPlans() {
        CreateAddOnDefRequest request = new CreateAddOnDefRequest();
        request.setLabel("Advanced Collections");
        when(addOnRepo.findAllByOrderBySortOrderAscLabelAsc()).thenReturn(List.of());
        when(addOnRepo.save(any())).thenAnswer(call -> call.getArgument(0));

        var created = service.createAddOnDef(request, "owner-1");

        assertThat(created.getKey()).isEqualTo("advanced_collections");
        assertThat(created.isEnforced()).isFalse();
        verify(planRepo, never()).save(any());
        verify(customLimitsRepo, never()).save(any());
        verify(auditClient).log(eq("ADD_ON"), eq("advanced_collections"), eq("CREATED"),
                eq("owner-1"), eq("SUPER_ADMIN"),
                org.mockito.ArgumentMatchers.isNull(), any(), eq("PLATFORM"));
    }

    @Test
    void cataloguedAddOnCannotBeAssignedBeforeCodeEnforcesIt() {
        CreatePlanRequest request = new CreatePlanRequest();
        request.setPlan("FUTURE");
        request.setDisplayName("Future Plan");
        request.setEnabledAddOns(List.of("advanced_collections"));
        when(addOnRepo.findAllById(List.of("advanced_collections"))).thenReturn(List.of(
                PlanAddOnDef.builder()
                        .key("advanced_collections").label("Advanced Collections").build()));

        assertThatThrownBy(() -> service.createPlan(request, "owner-1"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("catalogued but not implemented");

        verify(planRepo, never()).save(any());
        verifyNoInteractions(auditClient);
    }

    @Test
    void implementedAddOnIsReportedAsEnforcedAndCanBeAssigned() {
        CreatePlanRequest request = new CreatePlanRequest();
        request.setPlan("CHAT");
        request.setDisplayName("Chat Plan");
        request.setEnabledAddOns(List.of("live_chat"));
        PlanAddOnDef liveChat = PlanAddOnDef.builder()
                .key("live_chat").label("Live Chat").sortOrder(3).build();
        when(addOnRepo.findAllById(List.of("live_chat"))).thenReturn(List.of(liveChat));
        when(planRepo.save(any())).thenAnswer(call -> call.getArgument(0));

        assertThat(service.createPlan(request, "owner-1").getEnabledAddOns())
                .containsExactly("live_chat");

        when(addOnRepo.findAllByOrderBySortOrderAscLabelAsc()).thenReturn(List.of(liveChat));
        assertThat(service.getAddOnDefs()).singleElement()
                .satisfies(addOn -> assertThat(addOn.isEnforced()).isTrue());
    }

    @Test
    void planBuilderUsesSafeDocumentedDefaults() {
        PlanLimits plan = PlanLimits.builder()
                .plan("DEFAULTS").displayName("Defaults")
                .maxActiveChits(1).maxMembers(10)
                .allowedChitTypes("RESERVATION").priceMonthlyInr(1_000L)
                .build();

        assertThat(plan.isActive()).isTrue();
        assertThat(plan.isPublic()).isTrue();
        assertThat(plan.getMaxStaff()).isZero();
    }

    @Test
    void assignedAddOnCannotBeDeletedAndLeftInvisibleButEnabled() {
        String key = "live_chat";
        when(addOnRepo.findById(key)).thenReturn(Optional.of(
                PlanAddOnDef.builder().key(key).label("Live Chat").sortOrder(1).build()));
        when(planRepo.findAll()).thenReturn(List.of(
                PlanLimits.builder().plan("GROWTH").addOns("[\"live_chat\"]").build()));

        assertThatThrownBy(() -> service.deleteAddOnDef(key, "owner-1", "Catalog cleanup"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("every standard and custom plan");

        verify(addOnRepo, never()).delete(any());
        verifyNoInteractions(auditClient);
    }

    @Test
    void planCreationRecordsTheOwnerWhoChangedTheCatalog() {
        CreatePlanRequest request = new CreatePlanRequest();
        request.setPlan("FIELD");
        request.setDisplayName("Field Plan");
        request.setEnabledAddOns(List.of("live_chat"));
        when(addOnRepo.findAllById(List.of("live_chat"))).thenReturn(List.of(
                PlanAddOnDef.builder().key("live_chat").label("Live Chat").build()));
        when(planRepo.save(any())).thenAnswer(call -> call.getArgument(0));

        var created = service.createPlan(request, "owner-1");

        assertThat(created.getPlan()).isEqualTo("FIELD");
        verify(auditClient).log(eq("PLAN"), eq("FIELD"), eq("CREATED"),
                eq("owner-1"), eq("SUPER_ADMIN"),
                org.mockito.ArgumentMatchers.isNull(), any(), eq("PLATFORM"));
    }

    @Test
    void unknownAddOnIsRejectedInsteadOfAccidentallyGranted() {
        CreatePlanRequest request = new CreatePlanRequest();
        request.setPlan("BROKEN");
        request.setDisplayName("Broken Plan");
        request.setEnabledAddOns(List.of("unknown_future_feature"));
        when(addOnRepo.findAllById(List.of("unknown_future_feature"))).thenReturn(List.of());

        assertThatThrownBy(() -> service.createPlan(request, "owner-1"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("Unknown add-on keys");

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
    void tenantDiscountRejectsPercentageAboveOneHundred() {
        UUID tenantId = UUID.randomUUID();
        SetTenantDiscountRequest request = new SetTenantDiscountRequest();
        request.setDiscountType("percentage");
        request.setDiscountValue(new BigDecimal("100.01"));
        request.setReason("Retention offer");
        when(tenantRepository.findById(tenantId)).thenReturn(Optional.of(
                Tenant.builder().id(tenantId).name("Acme").build()));

        assertThatThrownBy(() -> service.setTenantDiscount(
                tenantId.toString(), request, "owner-1"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("cannot exceed 100");
        verifyNoInteractions(discountRepo);
        verifyNoInteractions(auditClient);
    }

    @Test
    void tenantDiscountNormalizesTypeAndAuditsMandatoryReason() {
        UUID tenantId = UUID.randomUUID();
        SetTenantDiscountRequest request = new SetTenantDiscountRequest();
        request.setDiscountType("percentage");
        request.setDiscountValue(new BigDecimal("15.00"));
        request.setReason(" Retention offer ");
        when(tenantRepository.findById(tenantId)).thenReturn(Optional.of(
                Tenant.builder().id(tenantId).name("Acme").build()));
        when(discountRepo.findByTenantId(tenantId.toString())).thenReturn(Optional.empty());
        when(discountRepo.save(any())).thenAnswer(call -> call.getArgument(0));

        var result = service.setTenantDiscount(tenantId.toString(), request, "owner-1");

        assertThat(result.getDiscountType()).isEqualTo("PERCENTAGE");
        assertThat(result.getReason()).isEqualTo("Retention offer");
        verify(auditClient).log(eq("TENANT"), eq(tenantId.toString()),
                eq("DISCOUNT_SET"), eq("owner-1"), eq("SUPER_ADMIN"),
                org.mockito.ArgumentMatchers.isNull(), any(), eq(tenantId.toString()),
                eq("Retention offer"));
    }

    @Test
    void standardPlanEditPropagatesToExistingTenantEffectiveLimits() {
        PlanLimits growth = PlanLimits.builder()
                .plan("GROWTH").displayName("Growth").isActive(true)
                .maxActiveChits(5).maxMembers(100).maxStaff(3)
                .addOns("[\"live_chat\"]")
                .allowedChitTypes("RESERVATION").priceMonthlyInr(39900).build();
        TenantCustomLimits tenantLimits = TenantCustomLimits.builder()
                .tenantId("tenant-1").planCode("GROWTH")
                .maxActiveChits(5).maxMembers(100).maxStaff(3)
                .addOns("[\"live_chat\"]")
                .allowedChitTypes("RESERVATION").priceMonthlyInr(39900).build();
        UpdatePlanRequest request = new UpdatePlanRequest();
        request.setMaxMembers(250);
        request.setMaxStaff(8);
        request.setAllowedChitTypes("reservation, auction");
        when(planRepo.findByPlanForUpdate("GROWTH")).thenReturn(Optional.of(growth));
        when(planRepo.save(growth)).thenReturn(growth);
        when(customLimitsRepo.findAllByPlanCode("GROWTH")).thenReturn(List.of(tenantLimits));

        service.updatePlan("growth", request, "owner-1", "Increase Growth plan capacity");

        assertThat(tenantLimits.getMaxMembers()).isEqualTo(250);
        assertThat(tenantLimits.getMaxStaff()).isEqualTo(8);
        assertThat(tenantLimits.getAllowedChitTypes()).isEqualTo("RESERVATION,AUCTION");
        verify(customLimitsRepo).save(tenantLimits);
        verify(auditClient).log(eq("TENANT"), eq("tenant-1"),
                eq("PLAN_DEFAULTS_APPLIED"), eq("owner-1"), eq("SUPER_ADMIN"),
                any(), any(), eq("tenant-1"), any(String.class));
    }

    @Test
    void entitlementEditRequiresReasonButDisplayReorderDoesNot() {
        PlanLimits growth = PlanLimits.builder()
                .plan("GROWTH").displayName("Growth").isActive(true)
                .maxMembers(100).displayOrder(2).build();
        when(planRepo.findByPlanForUpdate("GROWTH")).thenReturn(Optional.of(growth));
        when(planRepo.save(growth)).thenReturn(growth);

        UpdatePlanRequest entitlementChange = new UpdatePlanRequest();
        entitlementChange.setMaxMembers(200);
        assertThatThrownBy(() -> service.updatePlan(
                "growth", entitlementChange, "owner-1", null))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("reason is required");
        verify(planRepo, never()).save(any());

        UpdatePlanRequest reorder = new UpdatePlanRequest();
        reorder.setDisplayOrder(3);
        service.updatePlan("growth", reorder, "owner-1", null);

        assertThat(growth.getDisplayOrder()).isEqualTo(3);
        verify(planRepo).save(growth);
        verify(auditClient).log(eq("PLAN"), eq("GROWTH"), eq("UPDATED"),
                eq("owner-1"), eq("SUPER_ADMIN"), any(), any(), eq("PLATFORM"),
                org.mockito.ArgumentMatchers.isNull());
    }

    @Test
    void unassignedAddOnDeletionAuditsTheProvidedReason() {
        String key = "advanced_collections";
        PlanAddOnDef definition = PlanAddOnDef.builder()
                .key(key).label("Advanced Collections").sortOrder(9).build();
        when(addOnRepo.findById(key)).thenReturn(Optional.of(definition));
        when(planRepo.findAll()).thenReturn(List.of());
        when(customLimitsRepo.findAll()).thenReturn(List.of());

        service.deleteAddOnDef(key, "owner-1", "Remove abandoned addOn");

        verify(addOnRepo).delete(definition);
        verify(auditClient).log(eq("ADD_ON"), eq(key), eq("DELETED"),
                eq("owner-1"), eq("SUPER_ADMIN"), any(),
                org.mockito.ArgumentMatchers.isNull(), eq("PLATFORM"),
                eq("Remove abandoned addOn"));
    }

    @Test
    void repeatedPlanDeactivationDoesNotCreateAnotherAuditEvent() {
        PlanLimits inactive = PlanLimits.builder()
                .plan("RETIRED").displayName("Retired")
                .isActive(false).isPublic(false).build();
        when(planRepo.findByPlanForUpdate("RETIRED")).thenReturn(Optional.of(inactive));

        service.deletePlan("retired", "owner-1", "Retire obsolete plan");

        verify(planRepo).findByPlanForUpdate("RETIRED");
        verify(planRepo, never()).save(any());
        verifyNoInteractions(auditClient);
    }
}
