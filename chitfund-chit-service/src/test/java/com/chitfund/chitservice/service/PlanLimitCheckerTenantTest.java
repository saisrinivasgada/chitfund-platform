package com.chitfund.chitservice.service;

import com.chitfund.chitservice.client.UserServiceClient;
import com.chitfund.chitservice.domain.enums.ChitType;
import com.chitfund.chitservice.repository.ChitRepository;
import com.chitfund.common.context.TenantContext;
import com.chitfund.common.exception.BusinessException;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.when;

class PlanLimitCheckerTenantTest {

    private final ChitRepository chitRepository = mock(ChitRepository.class);
    private final UserServiceClient userServiceClient = mock(UserServiceClient.class);
    private final TenantOperationLock tenantOperationLock = mock(TenantOperationLock.class);
    private final PlanLimitChecker checker = new PlanLimitChecker(
            chitRepository, userServiceClient, tenantOperationLock);

    @AfterEach
    void clearTenant() {
        TenantContext.clear();
    }

    @Test
    void missingTenantCannotBypassChitCreationLimits() {
        assertThrows(BusinessException.class,
                () -> checker.checkCanCreateChit(ChitType.RESERVATION));
        verifyNoInteractions(chitRepository, userServiceClient);
    }

    @Test
    void missingTenantCannotBypassChitActivationLimits() {
        assertThrows(BusinessException.class, checker::checkCanActivateChit);
        verifyNoInteractions(chitRepository, userServiceClient);
    }

    @Test
    void unavailablePlanDataCannotBypassChitCreationLimits() {
        TenantContext.set("tenant-a");
        when(userServiceClient.getEffectiveLimits("tenant-a")).thenReturn(null);

        assertThrows(BusinessException.class,
                () -> checker.checkCanCreateChit(ChitType.RESERVATION));
        verifyNoInteractions(chitRepository);
    }

    @Test
    void unavailablePlanDataCannotBypassChitActivationLimits() {
        TenantContext.set("tenant-a");
        when(userServiceClient.getEffectiveLimits("tenant-a")).thenReturn(null);

        assertThrows(BusinessException.class, checker::checkCanActivateChit);
        verifyNoInteractions(chitRepository);
    }

    @Test
    void activationSerializesTheTenantBeforeCountingActiveChits() {
        TenantContext.set("tenant-a");
        when(userServiceClient.getEffectiveLimits("tenant-a")).thenReturn(
                java.util.Map.of("plan", "Growth", "tenantStatus", "ACTIVE", "maxActiveChits", 5));
        when(chitRepository.countByTenantIdAndStatusAndDeletedAtIsNull(
                "tenant-a", com.chitfund.chitservice.domain.enums.ChitStatus.ACTIVE)).thenReturn(4L);

        checker.checkCanActivateChit();

        var order = inOrder(tenantOperationLock, chitRepository);
        order.verify(tenantOperationLock).acquire("tenant-a");
        order.verify(chitRepository).countByTenantIdAndStatusAndDeletedAtIsNull(
                "tenant-a", com.chitfund.chitservice.domain.enums.ChitStatus.ACTIVE);
    }

    @Test
    void missingAllowedChitTypesCannotGrantEveryChitType() {
        TenantContext.set("tenant-a");
        when(userServiceClient.getEffectiveLimits("tenant-a")).thenReturn(
                java.util.Map.of("plan", "Growth", "tenantStatus", "ACTIVE"));

        assertThrows(BusinessException.class,
                () -> checker.checkCanCreateChit(ChitType.AUCTION));
        verifyNoInteractions(chitRepository, tenantOperationLock);
    }

    @Test
    void suspendedTenantCannotActivateChitWithAStaleActiveToken() {
        TenantContext.set("tenant-a");
        when(userServiceClient.getEffectiveLimits("tenant-a")).thenReturn(
                java.util.Map.of("plan", "Growth", "tenantStatus", "SUSPENDED", "maxActiveChits", 5));

        assertThrows(BusinessException.class, checker::checkCanActivateChit);
        verifyNoInteractions(chitRepository, tenantOperationLock);
    }
}
