package com.chitfund.paymentservice.service;

import com.chitfund.common.context.TenantContext;
import com.chitfund.common.exception.BusinessException;
import com.chitfund.common.exception.ErrorCode;
import com.chitfund.paymentservice.client.UserServiceClient;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.util.Map;

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
            log.warn("Could not fetch plan limits for tenant {} — allowing operation (user-service unavailable): {}", tenantId, e.getMessage());
            return;
        }
        if (limits == null) return;

        Object expiresAtRaw = limits.get("planExpiresAt");
        if (expiresAtRaw == null) return;

        try {
            LocalDateTime expiresAt = LocalDateTime.parse(expiresAtRaw.toString());
            if (expiresAt.isBefore(LocalDateTime.now())) {
                throw new BusinessException(ErrorCode.PLAN_EXPIRED,
                        "Your subscription has expired. Please renew your plan to record transactions.");
            }
        } catch (java.time.format.DateTimeParseException invalidPlanData) {
            throw new BusinessException(ErrorCode.INTERNAL_SERVER_ERROR,
                    "Subscription data is invalid. Please contact support.", HttpStatus.SERVICE_UNAVAILABLE);
        }
    }
}
