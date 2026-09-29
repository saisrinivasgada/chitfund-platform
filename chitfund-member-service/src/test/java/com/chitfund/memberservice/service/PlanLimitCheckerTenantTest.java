package com.chitfund.memberservice.service;

import com.chitfund.common.context.TenantContext;
import com.chitfund.common.exception.BusinessException;
import com.chitfund.memberservice.client.UserServiceClient;
import com.chitfund.memberservice.repository.MemberRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class PlanLimitCheckerTenantTest {

    private final MemberRepository memberRepository = mock(MemberRepository.class);
    private final UserServiceClient userServiceClient = mock(UserServiceClient.class);
    private final TenantOperationLock tenantOperationLock = mock(TenantOperationLock.class);
    private final PlanLimitChecker checker = new PlanLimitChecker(
            memberRepository, userServiceClient, tenantOperationLock);

    @AfterEach
    void clearTenant() {
        TenantContext.clear();
    }

    @Test
    void missingTenantCannotBypassMemberLimits() {
        assertThrows(BusinessException.class, checker::checkCanAddMember);
        verifyNoInteractions(memberRepository, userServiceClient);
    }

    @Test
    void memberCreationSerializesTheTenantBeforeCountingMembers() {
        TenantContext.set("tenant-a");
        when(userServiceClient.getEffectiveLimits("tenant-a")).thenReturn(
                java.util.Map.of("plan", "Growth", "maxMembers", 100));
        when(memberRepository.countByTenantIdAndDeletedAtIsNull("tenant-a")).thenReturn(99L);

        checker.checkCanAddMember();

        var order = inOrder(tenantOperationLock, memberRepository);
        order.verify(tenantOperationLock).acquire("tenant-a");
        order.verify(memberRepository).countByTenantIdAndDeletedAtIsNull("tenant-a");
    }
}
