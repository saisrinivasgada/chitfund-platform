package com.chitfund.chitservice.dto.request;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.util.UUID;

@Data
public class ReserveMonthRequest {

    @NotNull(message = "Member ID is required")
    private UUID memberId;

    @NotNull(message = "Month number is required")
    @Min(value = 1, message = "Month number must be at least 1")
    private Integer monthNumber;
}
