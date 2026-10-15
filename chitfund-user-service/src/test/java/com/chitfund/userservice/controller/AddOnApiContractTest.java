package com.chitfund.userservice.controller;

import com.chitfund.userservice.dto.request.CreateAddOnDefRequest;
import com.chitfund.userservice.dto.request.CreatePlanRequest;
import com.chitfund.userservice.dto.response.AddOnDefResponse;
import com.chitfund.userservice.dto.response.PlanResponse;
import com.chitfund.userservice.domain.entity.User;
import com.chitfund.userservice.service.PlanService;
import com.chitfund.userservice.service.TenantService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.http.MediaType;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.method.support.HandlerMethodArgumentResolver;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class AddOnApiContractTest {
    PlanService planService;
    TenantService tenantService;
    MockMvc mvc;

    @BeforeEach
    void setUp() {
        planService = mock(PlanService.class);
        tenantService = mock(TenantService.class);
        InternalAddOnController internal = new InternalAddOnController(tenantService);
        ReflectionTestUtils.setField(internal, "internalKey", "test-internal-key");
        User owner = mock(User.class);
        when(owner.getId()).thenReturn(UUID.fromString("10000000-0000-0000-0000-000000000001"));
        HandlerMethodArgumentResolver authenticationPrincipal = new HandlerMethodArgumentResolver() {
            @Override
            public boolean supportsParameter(org.springframework.core.MethodParameter parameter) {
                return parameter.hasParameterAnnotation(AuthenticationPrincipal.class);
            }

            @Override
            public Object resolveArgument(org.springframework.core.MethodParameter parameter,
                                          org.springframework.web.method.support.ModelAndViewContainer container,
                                          org.springframework.web.context.request.NativeWebRequest request,
                                          org.springframework.web.bind.support.WebDataBinderFactory binderFactory) {
                return owner;
            }
        };
        mvc = MockMvcBuilders.standaloneSetup(internal, new SuperAdminPlanController(planService))
                .setCustomArgumentResolvers(authenticationPrincipal)
                .build();
    }

    @Test
    void internalRouteStillRequiresTheInternalKey() throws Exception {
        mvc.perform(get("/internal/add-ons/tenants/tenant-a"))
                .andExpect(status().isForbidden());
        verifyNoInteractions(tenantService);

        when(tenantService.resolveAddOnsForTenant("tenant-a")).thenReturn(List.of("settlement"));
        mvc.perform(get("/internal/add-ons/tenants/tenant-a")
                        .header("X-Internal-Key", "test-internal-key"))
                .andExpect(status().isOk()).andExpect(jsonPath("$[0]").value("settlement"));
    }

    @Test
    void catalogueCrudUsesTheRenamedRoutes() throws Exception {
        AddOnDefResponse definition = AddOnDefResponse.builder()
                .key("live_chat").label("Live chat").sortOrder(3).build();
        when(planService.getAddOnDefs()).thenReturn(List.of(definition));
        when(planService.createAddOnDef(any(CreateAddOnDefRequest.class), anyString())).thenReturn(definition);

        mvc.perform(get("/api/super-admin/add-ons"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data[0].key").value("live_chat"));
        mvc.perform(post("/api/super-admin/add-ons").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"label\":\"Live chat\"}"))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.message").value("Add-on added"));
        mvc.perform(delete("/api/super-admin/add-ons/live_chat")
                        .header("X-Change-Reason", "Retire unused add-on"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.message").value("Add-on removed"));
        verify(planService).deleteAddOnDef(eq("live_chat"), anyString(), eq("Retire unused add-on"));
    }

    @Test
    void planCreationReadsAndReturnsEnabledAddOns() throws Exception {
        when(planService.createPlan(any(CreatePlanRequest.class), anyString())).thenReturn(
                PlanResponse.builder().plan("TEST").enabledAddOns(List.of("live_chat")).build());

        mvc.perform(post("/api/super-admin/plans").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"plan\":\"TEST\",\"displayName\":\"Test\",\"enabledAddOns\":[\"live_chat\"]}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.enabledAddOns[0]").value("live_chat"));

        ArgumentCaptor<CreatePlanRequest> request = ArgumentCaptor.forClass(CreatePlanRequest.class);
        verify(planService).createPlan(request.capture(),
                eq("10000000-0000-0000-0000-000000000001"));
        assertThat(request.getValue().getEnabledAddOns()).containsExactly("live_chat");
    }
}
