package com.chitfund.chitservice.service;

import com.chitfund.chitservice.client.UserServiceClient;
import com.chitfund.chitservice.domain.enums.ChitStatus;
import com.chitfund.chitservice.domain.enums.ChitType;
import com.chitfund.chitservice.repository.ChitRepository;
import com.chitfund.common.context.TenantContext;
import com.chitfund.common.exception.BusinessException;
import com.chitfund.common.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

@Component
@RequiredArgsConstructor
public class PlanLimitChecker {

    private final ChitRepository chitRepository;
    private final UserServiceClient userServiceClient;

    public void checkCanCreateChit(ChitType chitType) {
        String tenantId = TenantContext.get();
        if (tenantId == null) return; // super-admin, no limits

        Map<String, Object> limits = userServiceClient.getEffectiveLimits(tenantId);
        if (limits == null) return; // fail open if user-service unreachable

        checkNotExpiredInternal(limits);

        String planName = (String) limits.getOrDefault("plan", "current");

        // Only check allowed chit types at creation time — active count is enforced at activation
        String allowedTypesStr = (String) limits.get("allowedChitTypes");
        if (allowedTypesStr != null && !allowedTypesStr.isBlank()) {
            Set<String> allowed = Arrays.stream(allowedTypesStr.split(","))
                    .map(String::trim)
                    .collect(Collectors.toSet());
            if (!allowed.contains(chitType.name())) {
                throw new BusinessException(ErrorCode.PLAN_LIMIT_EXCEEDED,
                        "Chit type " + chitType + " is not available on the " + planName + " plan. "
                        + "Contact ChitWise support to upgrade.");
            }
        }
    }

    public void checkCanActivateChit() {
        String tenantId = TenantContext.get();
        if (tenantId == null) return;

        Map<String, Object> limits = userServiceClient.getEffectiveLimits(tenantId);
        if (limits == null) return;

        checkNotExpiredInternal(limits);

        String planName = (String) limits.getOrDefault("plan", "current");
        Object maxChitsRaw = limits.get("maxActiveChits");
        int maxChits = maxChitsRaw instanceof Number ? ((Number) maxChitsRaw).intValue() : 1;
        if (maxChits == -1) return;

        long activeCount = chitRepository.countByTenantIdAndStatusAndDeletedAtIsNull(tenantId, ChitStatus.ACTIVE);
        if (activeCount >= maxChits) {
            throw new BusinessException(ErrorCode.PLAN_LIMIT_EXCEEDED,
                    "Your " + planName + " plan allows a maximum of " + maxChits
                    + " active chit group" + (maxChits == 1 ? "" : "s") + ". "
                    + "Archive an existing chit or contact ChitWise support to upgrade.");
        }
    }

    public void checkNotExpired() {
        String tenantId = TenantContext.get();
        if (tenantId == null) return;
        Map<String, Object> limits = userServiceClient.getEffectiveLimits(tenantId);
        if (limits == null) return;
        checkNotExpiredInternal(limits);
    }

    private void checkNotExpiredInternal(Map<String, Object> limits) {
        Object expiresAtRaw = limits.get("planExpiresAt");
        if (expiresAtRaw == null) return;
        try {
            LocalDateTime expiresAt = LocalDateTime.parse(expiresAtRaw.toString());
            if (expiresAt.isBefore(LocalDateTime.now())) {
                throw new BusinessException(ErrorCode.PLAN_EXPIRED,
                        "Your subscription has expired. Please renew your plan to continue.");
            }
        } catch (java.time.format.DateTimeParseException ignored) {
            // malformed date — fail open
        }
    }
}
