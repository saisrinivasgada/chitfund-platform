package com.chitfund.paymentservice.service;

import com.chitfund.common.context.TenantContext;
import com.chitfund.common.exception.BusinessException;
import com.chitfund.paymentservice.client.UserServiceClient;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class PlanExpiryCheckerTenantTest {

    private final UserServiceClient userServiceClient = mock(UserServiceClient.class);
    private final PlanExpiryChecker checker = new PlanExpiryChecker(userServiceClient);

    @AfterEach
    void clearTenant() {
        TenantContext.clear();
    }

    @Test
    void missingTenantCannotBypassPaymentPlanCheck() {
        assertThrows(BusinessException.class, checker::assertNotExpired);
        verifyNoInteractions(userServiceClient);
    }

    @Test
    void unavailablePlanDataCannotBypassPaymentPlanCheck() {
        TenantContext.set("tenant-a");
        when(userServiceClient.getEffectiveLimits("tenant-a")).thenReturn(null);

        assertThrows(BusinessException.class, checker::assertNotExpired);
    }

    @Test
    void planLookupExceptionCannotBypassPaymentPlanCheck() {
        TenantContext.set("tenant-a");
        when(userServiceClient.getEffectiveLimits("tenant-a"))
                .thenThrow(new IllegalStateException("user-service unavailable"));

        assertThrows(BusinessException.class, checker::assertNotExpired);
    }

    @Test
    void currentSuspensionCannotBeBypassedByAStaleActiveToken() {
        TenantContext.set("tenant-a");
        when(userServiceClient.getEffectiveLimits("tenant-a"))
                .thenReturn(java.util.Map.of("tenantStatus", "SUSPENDED"));

        assertThrows(BusinessException.class, checker::assertNotExpired);
    }
}
