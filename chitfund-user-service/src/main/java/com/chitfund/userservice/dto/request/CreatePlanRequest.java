package com.chitfund.userservice.dto.request;

import jakarta.validation.constraints.NotBlank;
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
    private int maxActiveChits = 3;
    private int maxMembers = 100;
    private String allowedChitTypes = "RESERVATION";
    private long priceMonthlyInr = 0;
    private BigDecimal globalDiscountPct;
    private boolean isPublic = false;
    private int displayOrder = 99;
    private int maxStaff = 0;
    private List<String> enabledCapabilities;
}
