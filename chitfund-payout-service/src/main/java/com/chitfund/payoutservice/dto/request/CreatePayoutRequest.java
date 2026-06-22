package com.chitfund.payoutservice.dto.request;

import jakarta.validation.constraints.*;
import lombok.Data;

import java.math.BigDecimal;
import java.util.UUID;

@Data
public class CreatePayoutRequest {

    @NotNull
    private UUID chitId;

    @NotNull
    private UUID memberId;

    @NotNull
    @Min(1)
    private Integer monthNumber;

    // Total collected from all members for this month
    @NotNull
    @DecimalMin("0.01")
    private BigDecimal winningAmount;

    // Total deduction = installmentSettlement + crossChitSettlement + manualAdjustment
    @NotNull
    @DecimalMin("0.00")
    private BigDecimal discountAmount;

    // Breakdown of discountAmount (all optional, default 0)
    private BigDecimal installmentSettlement;
    private BigDecimal crossChitSettlement;
    private BigDecimal manualAdjustment;

    private String notes;
}
