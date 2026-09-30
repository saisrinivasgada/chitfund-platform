package com.chitfund.payoutservice.service;

import com.chitfund.common.context.TenantContext;
import com.chitfund.common.exception.BusinessException;
import com.chitfund.common.exception.ErrorCode;
import com.chitfund.payoutservice.client.UserServiceClient;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.time.format.DateTimeParseException;
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
        if (limits == null) throw unavailable();

        Object expiresAtRaw = limits.get("planExpiresAt");
        if (expiresAtRaw == null) return;
        try {
            if (LocalDateTime.parse(expiresAtRaw.toString()).isBefore(LocalDateTime.now())) {
                throw new BusinessException(ErrorCode.PLAN_EXPIRED,
                        "Your subscription has expired. Please renew your plan to create or disburse payouts.");
            }
        } catch (DateTimeParseException invalidPlanData) {
            throw new BusinessException(ErrorCode.INTERNAL_SERVER_ERROR,
                    "Subscription data is invalid. Please contact support.", HttpStatus.SERVICE_UNAVAILABLE);
        }
    }

    private BusinessException unavailable() {
        return new BusinessException(ErrorCode.INTERNAL_SERVER_ERROR,
                "Subscription could not be verified. Please try again.", HttpStatus.SERVICE_UNAVAILABLE);
    }
}
