package com.chitfund.payoutservice.service;

import com.chitfund.common.context.TenantContext;
import com.chitfund.common.exception.BusinessException;
import com.chitfund.common.exception.ErrorCode;
import com.chitfund.common.plan.PlanEntitlementVerifier;
import com.chitfund.payoutservice.client.UserServiceClient;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.Map;

/** Prevents new payout money movements when the current subscription cannot be proven active. */
@Component
@RequiredArgsConstructor
@Slf4j
public class PlanExpiryChecker {

    private final UserServiceClient userServiceClient;

    public void assertNotExpired() {
        String tenantId = TenantContext.get();
        if (tenantId == null || tenantId.isBlank()) {
            throw new BusinessException(ErrorCode.FORBIDDEN,
                    "Organization context is required", HttpStatus.FORBIDDEN);
        }

        Map<String, Object> limits;
        try {
            limits = userServiceClient.getEffectiveLimits(tenantId);
        } catch (Exception e) {
            log.warn("Could not fetch plan limits for tenant {} — denying operation: {}",
                    tenantId, e.getMessage());
            throw unavailable();
        }
        PlanEntitlementVerifier.requireActiveSubscription(limits);
    }

    private BusinessException unavailable() {
        return new BusinessException(ErrorCode.INTERNAL_SERVER_ERROR,
                "Subscription could not be verified. Please try again.", HttpStatus.SERVICE_UNAVAILABLE);
    }
}
