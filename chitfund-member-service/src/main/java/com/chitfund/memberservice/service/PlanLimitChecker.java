package com.chitfund.memberservice.service;

import com.chitfund.common.context.TenantContext;
import com.chitfund.common.exception.BusinessException;
import com.chitfund.common.exception.ErrorCode;
import com.chitfund.common.plan.PlanEntitlementVerifier;
import com.chitfund.memberservice.client.UserServiceClient;
import com.chitfund.memberservice.repository.MemberRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

import java.util.Map;

@Component
@RequiredArgsConstructor
public class PlanLimitChecker {

    private final MemberRepository memberRepository;
    private final UserServiceClient userServiceClient;
    private final TenantOperationLock tenantOperationLock;

    public void checkCanAddMember() {
        String tenantId = TenantContext.get();
        if (tenantId == null || tenantId.isBlank()) {
            throw new BusinessException(ErrorCode.FORBIDDEN,
                    "Organization context is required", HttpStatus.FORBIDDEN);
        }

        Map<String, Object> limits = userServiceClient.getEffectiveLimits(tenantId);
        PlanEntitlementVerifier.requireActiveSubscription(limits);

        String planName = (String) limits.getOrDefault("plan", "current");

        int maxMembers = PlanEntitlementVerifier.requireLimit(limits, "maxMembers");
        if (maxMembers == -1) return; // unlimited

        tenantOperationLock.acquire(tenantId);
        long current = memberRepository.countByTenantIdAndDeletedAtIsNull(tenantId);
        if (current >= maxMembers) {
            throw new BusinessException(ErrorCode.PLAN_LIMIT_EXCEEDED,
                    "Your " + planName + " plan allows a maximum of " + maxMembers
                    + " member" + (maxMembers == 1 ? "" : "s") + ". "
                    + "Contact ChitWise support to upgrade your plan.");
        }
    }

}
