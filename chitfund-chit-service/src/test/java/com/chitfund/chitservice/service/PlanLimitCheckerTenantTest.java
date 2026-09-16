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

class PlanLimitCheckerTenantTest {

    private final ChitRepository chitRepository = mock(ChitRepository.class);
    private final UserServiceClient userServiceClient = mock(UserServiceClient.class);
    private final PlanLimitChecker checker = new PlanLimitChecker(chitRepository, userServiceClient);

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
}
