package com.chitfund.userservice.dto.request;

import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Data
public class UpdatePromotionRequest {
    private String label;
    private String description;
    private BigDecimal discountPct;
    private String appliesToPlans;
    private BigDecimal referrerCreditInr;
    private LocalDateTime validFrom;
    private LocalDateTime validUntil;
    private Integer maxUses;
    private Boolean isPublic;
    private Boolean isActive;
    private String discountDurationType; // ONCE | MONTHS | FOREVER
    private Integer discountDurationMonths;
}
