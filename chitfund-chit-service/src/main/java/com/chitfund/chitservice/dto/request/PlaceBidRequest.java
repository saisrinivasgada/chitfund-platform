package com.chitfund.chitservice.dto.request;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.math.BigDecimal;
import java.util.UUID;

@Data
public class PlaceBidRequest {

    // The payout amount this member is willing to accept (must be < current best bid)
    @NotNull
    @DecimalMin("0.01")
    private BigDecimal bidAmount;

    // Admin/Manager only: place bid on behalf of this member
    private UUID onBehalfOfMemberId;
}
