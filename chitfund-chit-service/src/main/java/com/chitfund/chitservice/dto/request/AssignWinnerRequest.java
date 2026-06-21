package com.chitfund.chitservice.dto.request;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.math.BigDecimal;
import java.util.UUID;

@Data
public class AssignWinnerRequest {

    @NotNull(message = "Month number is required")
    @Min(value = 1, message = "Month number must be at least 1")
    private Integer monthNumber;

    // Required for AUCTION mode; also used to explicitly assign winner in RESERVATION mode
    private UUID winnerId;

    // Required for AUCTION mode — how much the winner discounted the pot
    private BigDecimal discountAmount;

    // Actual payout the winner receives (from their schedule slot). If omitted, defaults to chit total amount.
    private BigDecimal winningAmount;
}
