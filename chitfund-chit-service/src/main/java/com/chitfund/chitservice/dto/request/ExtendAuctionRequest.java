package com.chitfund.chitservice.dto.request;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

@Data
public class ExtendAuctionRequest {
    @NotNull
    @Min(1)
    @Max(120)
    private Integer additionalMinutes;
}
