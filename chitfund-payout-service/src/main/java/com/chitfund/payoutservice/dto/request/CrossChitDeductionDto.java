package com.chitfund.payoutservice.dto.request;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.util.UUID;

@Data
public class CrossChitDeductionDto {
    @NotNull
    private UUID chitId;
    @NotNull
    @Min(1)
    private Integer monthNumber;
}
