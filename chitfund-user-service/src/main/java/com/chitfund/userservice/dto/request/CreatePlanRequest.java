package com.chitfund.userservice.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.PositiveOrZero;
import lombok.Data;

import java.math.BigDecimal;
import java.util.List;

@Data
public class CreatePlanRequest {

    @NotBlank
    private String plan;

    @NotBlank
    private String displayName;

    private String tagline;
    private List<String> features;
    @Min(-1)
    private int maxActiveChits = 3;
    @Min(-1)
    private int maxMembers = 100;
    @NotBlank
    private String allowedChitTypes = "RESERVATION";
    @PositiveOrZero
    private long priceMonthlyInr = 0;
    @DecimalMin("0.00")
    @DecimalMax("100.00")
    private BigDecimal globalDiscountPct;
    private boolean isPublic = false;
    @Min(0)
    private int displayOrder = 99;
    @Min(-1)
    private int maxStaff = 0;
    private List<String> enabledCapabilities;
}
