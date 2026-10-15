package com.chitfund.chitservice.service;

import com.chitfund.chitservice.client.UserServiceClient;
import com.chitfund.chitservice.domain.enums.ChitStatus;
import com.chitfund.chitservice.domain.enums.ChitType;
import com.chitfund.chitservice.repository.ChitRepository;
import com.chitfund.common.context.TenantContext;
import com.chitfund.common.exception.BusinessException;
import com.chitfund.common.exception.ErrorCode;
import com.chitfund.common.plan.PlanEntitlementVerifier;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

import java.util.*;

@Component
@RequiredArgsConstructor
@Slf4j
public class PlanLimitChecker {

    private final ChitRepository chitRepository;
    private final UserServiceClient userServiceClient;
    private final TenantOperationLock tenantOperationLock;

    public void checkCanCreateChit(ChitType chitType) {
        String tenantId = requireTenant();

        Map<String, Object> limits = fetchLimits(tenantId);
        PlanEntitlementVerifier.requireActiveSubscription(limits);

        String planName = (String) limits.getOrDefault("plan", "current");

        // Only check allowed chit types at creation time — active count is enforced at activation
        Set<String> allowed = PlanEntitlementVerifier.requireCsvValues(
                limits, "allowedChitTypes",
                Arrays.stream(ChitType.values()).map(Enum::name).collect(java.util.stream.Collectors.toSet()));
        if (!allowed.contains(chitType.name())) {
            throw new BusinessException(ErrorCode.PLAN_LIMIT_EXCEEDED,
                    "Chit type " + chitType + " is not available on the " + planName + " plan. "
                    + "Contact ChitWise support to upgrade.");
        }
    }

    public void checkCanActivateChit() {
        String tenantId = requireTenant();

        Map<String, Object> limits = fetchLimits(tenantId);
        PlanEntitlementVerifier.requireActiveSubscription(limits);

        String planName = (String) limits.getOrDefault("plan", "current");
        int maxChits = PlanEntitlementVerifier.requireLimit(limits, "maxActiveChits");
        if (maxChits == -1) return;

        tenantOperationLock.acquire(tenantId);
        long activeCount = chitRepository.countByTenantIdAndStatusAndDeletedAtIsNull(tenantId, ChitStatus.ACTIVE);
        if (activeCount >= maxChits) {
            throw new BusinessException(ErrorCode.PLAN_LIMIT_EXCEEDED,
                    "Your " + planName + " plan allows a maximum of " + maxChits
                    + " active chit group" + (maxChits == 1 ? "" : "s") + ". "
                    + "Archive an existing chit or contact ChitWise support to upgrade.");
        }
    }

    public void checkNotExpired() {
        String tenantId = requireTenant();
        Map<String, Object> limits = fetchLimits(tenantId);
        PlanEntitlementVerifier.requireActiveSubscription(limits);
    }

    private String requireTenant() {
        String tenantId = TenantContext.get();
        if (tenantId == null || tenantId.isBlank()) {
            throw new BusinessException(ErrorCode.FORBIDDEN,
                    "Organization context is required", HttpStatus.FORBIDDEN);
        }
        return tenantId;
    }

    private Map<String, Object> fetchLimits(String tenantId) {
        try {
            return userServiceClient.getEffectiveLimits(tenantId);
        } catch (Exception e) {
            log.warn("Could not fetch plan limits for tenant {} — denying operation: {}", tenantId, e.getMessage());
            return null;
        }
    }

}
