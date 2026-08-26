package com.chitfund.chitservice.dto.request;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Data
public class OpenAuctionRequest {

    @NotNull
    @Min(1)
    private Integer monthNumber;

    // Maximum prize amount for this month — winner cannot bid above this
    @NotNull
    @DecimalMin("1.00")
    private BigDecimal scheduledPayoutAmount;

    // Optional: when the auction auto-closes (ONLINE mode only)
    // Null = admin must close manually
    private LocalDateTime closesAt;

    // Minimum gap (₹) between consecutive bids (ONLINE only). Null = any lower bid wins.
    @DecimalMin("1.00")
    private BigDecimal minBidStep;

    // Optional admin commission. commissionType: "FIXED" or "PERCENTAGE"
    // For FIXED: commissionValue is the flat ₹ amount.
    // For PERCENTAGE: commissionValue is the % of the discount (e.g. 30 → 30%).
    private String commissionType;

    @DecimalMin("0.00")
    private BigDecimal commissionValue;

    // If true, members see the commission breakdown in the auction room.
    private boolean showCommissionToMembers = false;
}
