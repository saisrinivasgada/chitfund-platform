package com.chitfund.userservice.dto.request;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.PositiveOrZero;
import lombok.Data;

import java.math.BigDecimal;
import java.util.List;

@Data
public class UpdatePlanRequest {
    private String displayName;
    private String tagline;
    private List<String> features;
    @Min(-1)
    private Integer maxActiveChits;
    @Min(-1)
    private Integer maxMembers;
    private String allowedChitTypes;
    @PositiveOrZero
    private Long priceMonthlyInr;
    @DecimalMin("0.00")
    @DecimalMax("100.00")
    private BigDecimal globalDiscountPct;
    private Boolean isPublic;
    private Boolean isActive;
    @Min(0)
    private Integer displayOrder;
    @Min(-1)
    private Integer maxStaff;
    private List<String> enabledAddOns;
    private String badges; // raw JSON array: [{text,color,enabled}]
}
