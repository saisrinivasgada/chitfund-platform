package com.chitfund.userservice.dto.request;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Data
public class CreatePromotionRequest {

    @NotBlank
    private String code;

    @NotBlank
    private String label;

    private String description;

    @NotNull
    private String promoType; // STANDARD | REFERRAL

    @NotNull
    @DecimalMin("0.00")
    private BigDecimal discountPct;

    private String appliesToPlans; // null = all, or "BASIC,GROWTH"

    private BigDecimal referrerCreditInr; // only for REFERRAL type

    private LocalDateTime validFrom;
    private LocalDateTime validUntil;

    // ONCE = next billing cycle only, MONTHS = N months, FOREVER = never expires
    private String discountDurationType = "FOREVER"; // ONCE | MONTHS | FOREVER

    private Integer discountDurationMonths; // only used when discountDurationType=MONTHS

    private Integer maxUses;

    private boolean isPublic = false;
}
