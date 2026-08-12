package com.chitfund.userservice.dto.response;

import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;

@Data
@Builder
public class PromotionResponse {
    private UUID id;
    private String code;
    private String label;
    private String description;
    private String promoType;
    private BigDecimal discountPct;
    private String appliesToPlans;
    private BigDecimal referrerCreditInr;
    private LocalDateTime validFrom;
    private LocalDateTime validUntil;
    private String discountDurationType;
    private Integer discountDurationMonths;
    private Integer maxUses;
    private int usesCount;
    private boolean isPublic;
    private boolean isActive;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
