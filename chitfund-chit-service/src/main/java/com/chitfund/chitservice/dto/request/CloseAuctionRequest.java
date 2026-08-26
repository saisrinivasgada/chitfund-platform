package com.chitfund.chitservice.dto.request;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.math.BigDecimal;
import java.util.UUID;

@Data
public class CloseAuctionRequest {

    // OFFLINE only: admin provides winner + won amount manually.
    // ONLINE: these are ignored — winner is taken from the highest bid.
    private UUID winnerId;

    @DecimalMin("0.01")
    private BigDecimal wonAmount;
}
