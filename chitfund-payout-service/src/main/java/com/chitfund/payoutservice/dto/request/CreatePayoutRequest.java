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

    // 0 for lottery/reservation; auction bid discount for auction mode
    @NotNull
    @DecimalMin("0.00")
    private BigDecimal discountAmount;

    private String notes;
}
