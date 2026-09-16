package com.chitfund.memberservice.service;

import com.chitfund.common.context.TenantContext;
import com.chitfund.common.exception.BusinessException;
import com.chitfund.memberservice.client.UserServiceClient;
import com.chitfund.memberservice.repository.MemberRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;

class PlanLimitCheckerTenantTest {

    private final MemberRepository memberRepository = mock(MemberRepository.class);
    private final UserServiceClient userServiceClient = mock(UserServiceClient.class);
    private final PlanLimitChecker checker = new PlanLimitChecker(memberRepository, userServiceClient);

    @AfterEach
    void clearTenant() {
        TenantContext.clear();
    }

    @Test
    void missingTenantCannotBypassMemberLimits() {
        assertThrows(BusinessException.class, checker::checkCanAddMember);
        verifyNoInteractions(memberRepository, userServiceClient);
    }
}
