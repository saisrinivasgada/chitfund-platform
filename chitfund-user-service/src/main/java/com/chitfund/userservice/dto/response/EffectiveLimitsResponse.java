package com.chitfund.userservice.dto.response;

import lombok.Builder;
import lombok.Data;

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
    private boolean analyticsEnabled;
    private boolean prioritySupport;
    private String notes;
    private String planExpiresAt;   // ISO string, null = never expires
}
