package com.chitfund.payoutservice.service;

import com.chitfund.common.context.TenantContext;
import com.chitfund.common.exception.BusinessException;
import com.chitfund.payoutservice.client.UserServiceClient;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class PlanExpiryCheckerTest {

    private final UserServiceClient userServiceClient = mock(UserServiceClient.class);
    private final PlanExpiryChecker checker = new PlanExpiryChecker(userServiceClient);

    @AfterEach
    void clearTenant() {
        TenantContext.clear();
    }

    @Test
    void activePlanAllowsPayoutMutation() {
        TenantContext.set("tenant-a");
        when(userServiceClient.getEffectiveLimits("tenant-a"))
                .thenReturn(Map.of("tenantStatus", "ACTIVE",
                        "planExpiresAt", LocalDateTime.now().plusDays(1).toString()));

        assertThatCode(checker::assertNotExpired).doesNotThrowAnyException();
    }

    @Test
    void expiredPlanIsRejectedUsingFreshServerState() {
        TenantContext.set("tenant-a");
        when(userServiceClient.getEffectiveLimits("tenant-a"))
                .thenReturn(Map.of("tenantStatus", "ACTIVE",
                        "planExpiresAt", LocalDateTime.now().minusMinutes(1).toString()));

        assertThatThrownBy(checker::assertNotExpired)
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("subscription has expired");
    }

    @Test
    void missingTenantCannotBypassCheck() {
        assertThatThrownBy(checker::assertNotExpired).isInstanceOf(BusinessException.class);
        verifyNoInteractions(userServiceClient);
    }

    @Test
    void unavailableOrMalformedPlanDataFailsClosed() {
        TenantContext.set("tenant-a");
        when(userServiceClient.getEffectiveLimits("tenant-a")).thenReturn(null);
        assertThatThrownBy(checker::assertNotExpired).isInstanceOf(BusinessException.class);

        when(userServiceClient.getEffectiveLimits("tenant-a"))
                .thenReturn(Map.of("tenantStatus", "ACTIVE", "planExpiresAt", "not-a-date"));
        assertThatThrownBy(checker::assertNotExpired).isInstanceOf(BusinessException.class);
    }

    @Test
    void currentSuspensionBlocksPayoutDespiteAStaleActiveToken() {
        TenantContext.set("tenant-a");
        when(userServiceClient.getEffectiveLimits("tenant-a"))
                .thenReturn(Map.of("tenantStatus", "SUSPENDED"));

        assertThatThrownBy(checker::assertNotExpired)
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("suspended");
    }
}
