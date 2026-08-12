package com.chitfund.memberservice.service;

import com.chitfund.common.context.TenantContext;
import com.chitfund.common.exception.BusinessException;
import com.chitfund.common.exception.ErrorCode;
import com.chitfund.memberservice.client.UserServiceClient;
import com.chitfund.memberservice.repository.MemberRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.util.Map;

@Component
@RequiredArgsConstructor
public class PlanLimitChecker {

    private final MemberRepository memberRepository;
    private final UserServiceClient userServiceClient;

    public void checkCanAddMember() {
        String tenantId = TenantContext.get();
        if (tenantId == null) return; // super-admin / internal call

        Map<String, Object> limits = userServiceClient.getEffectiveLimits(tenantId);
        if (limits == null) return; // fail open if user-service unreachable

        checkNotExpired(limits);

        String planName = (String) limits.getOrDefault("plan", "current");

        Object maxMembersRaw = limits.get("maxMembers");
        int maxMembers = maxMembersRaw instanceof Number ? ((Number) maxMembersRaw).intValue() : 20;
        if (maxMembers == -1) return; // unlimited

        long current = memberRepository.countByTenantIdAndDeletedAtIsNull(tenantId);
        if (current >= maxMembers) {
            throw new BusinessException(ErrorCode.PLAN_LIMIT_EXCEEDED,
                    "Your " + planName + " plan allows a maximum of " + maxMembers
                    + " member" + (maxMembers == 1 ? "" : "s") + ". "
                    + "Contact ChitWise support to upgrade your plan.");
        }
    }

    private void checkNotExpired(Map<String, Object> limits) {
        Object expiresAtRaw = limits.get("planExpiresAt");
        if (expiresAtRaw == null) return;
        try {
            LocalDateTime expiresAt = LocalDateTime.parse(expiresAtRaw.toString());
            if (expiresAt.isBefore(LocalDateTime.now())) {
                throw new BusinessException(ErrorCode.PLAN_EXPIRED,
                        "Your subscription has expired. Please renew your plan to continue adding members.");
            }
        } catch (java.time.format.DateTimeParseException ignored) {
            // malformed date — fail open
        }
    }
}
