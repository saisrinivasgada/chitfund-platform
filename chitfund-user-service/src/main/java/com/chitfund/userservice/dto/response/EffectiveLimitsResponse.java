package com.chitfund.userservice.dto.response;

import lombok.Builder;
import lombok.Data;

import java.util.List;

@Data
@Builder
public class EffectiveLimitsResponse {
    private String plan;
    private boolean isCustom;
    private int maxActiveChits;
    private int maxMembers;
    private int maxStaff;           // 0 = none, -1 = unlimited
    private String allowedChitTypes;
    private long priceMonthlyInr;
    private List<String> enabledCapabilities;
    private boolean analyticsEnabled;  // derived: enabledCapabilities.contains("full_analytics")
    private boolean prioritySupport;   // derived: enabledCapabilities.contains("priority_support")
    private String notes;
    private String planExpiresAt;   // ISO string, null = never expires
}
