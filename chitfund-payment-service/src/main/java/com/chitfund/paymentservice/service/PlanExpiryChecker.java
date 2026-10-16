package com.chitfund.paymentservice.service;

import com.chitfund.common.context.TenantContext;
import com.chitfund.common.exception.BusinessException;
import com.chitfund.common.exception.ErrorCode;
import com.chitfund.common.plan.PlanEntitlementVerifier;
import com.chitfund.common.offline.OfflineReconciliationRequest;
import com.chitfund.paymentservice.client.UserServiceClient;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.UUID;
import java.time.Instant;

@Component
@RequiredArgsConstructor
@Slf4j
public class PlanExpiryChecker {

    private final UserServiceClient userServiceClient;

    public String assertRecordedPaymentMaySync(UUID actorId, String token, Instant recordedAt) {
        String tenantId = TenantContext.get();
        if (tenantId == null || tenantId.isBlank() || actorId == null) {
            throw new BusinessException(ErrorCode.FORBIDDEN,
                    "Organization and account context are required", HttpStatus.FORBIDDEN);
        }
        return userServiceClient.verifyOfflineRecordedAction(new OfflineReconciliationRequest(
                actorId.toString(), tenantId, "ADMIN", "RECORD_PAYMENT", token, recordedAt));
    }

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
            log.warn("Could not fetch plan limits for tenant {} — denying operation: {}", tenantId, e.getMessage());
            throw unavailable();
        }
        PlanEntitlementVerifier.requireActiveSubscription(limits);
    }

    private BusinessException unavailable() {
        return new BusinessException(ErrorCode.INTERNAL_SERVER_ERROR,
                "Subscription could not be verified. Please try again.", HttpStatus.SERVICE_UNAVAILABLE);
    }
}
