package com.chitfund.userservice.dto.response;

import lombok.Builder;
import lombok.Data;

import java.util.List;

@Data
@Builder
public class EffectiveLimitsResponse {
    private String plan;
    private String tenantStatus;
    private boolean isCustom;
    private int maxActiveChits;
    private int maxMembers;
    private int maxStaff;           // 0 = none, -1 = unlimited
    private String allowedChitTypes;
    private long priceMonthlyInr;
    private List<String> enabledAddOns;
    private boolean analyticsEnabled;  // derived: enabledAddOns.contains("full_analytics")
    private boolean prioritySupport;   // derived: enabledAddOns.contains("priority_support")
    private boolean chatEnabled;       // derived: enabledAddOns.contains("live_chat")
    private boolean settlementEnabled; // derived: enabledAddOns.contains("settlement")
    private String notes;
    private String planExpiresAt;   // ISO string, null = never expires
}
