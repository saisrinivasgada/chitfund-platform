package com.chitfund.payoutservice.dto.request;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.math.BigDecimal;
import java.util.UUID;

@Data
public class CrossChitDeductionDto {
    @NotNull
    private UUID chitId;

    @NotNull
    @DecimalMin("0.01")
    private BigDecimal amount;
}
