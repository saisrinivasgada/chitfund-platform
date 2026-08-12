package com.chitfund.userservice.dto.response;

import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.util.List;

@Data
@Builder
public class PlanResponse {
    private String plan;
    private String displayName;
    private String tagline;
    private List<String> features;
    private int maxActiveChits;
    private int maxMembers;
    private String allowedChitTypes;
    private long priceMonthlyInr;
    private BigDecimal globalDiscountPct;
    private long effectivePriceInr;
    private Boolean isPublic;
    private Boolean isActive;
    private int displayOrder;
    private int maxStaff;
    private boolean analyticsEnabled;
    private boolean prioritySupport;
}
