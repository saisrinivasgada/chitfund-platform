package com.chitfund.userservice.dto.request;

import lombok.Data;

import java.math.BigDecimal;
import java.util.List;

@Data
public class UpdatePlanRequest {
    private String displayName;
    private String tagline;
    private List<String> features;
    private Integer maxActiveChits;
    private Integer maxMembers;
    private String allowedChitTypes;
    private Long priceMonthlyInr;
    private BigDecimal globalDiscountPct;
    private Boolean isPublic;
    private Boolean isActive;
    private Integer displayOrder;
    private Integer maxStaff;
    private List<String> enabledCapabilities;
}
