package com.chitfund.paymentservice.dto.request;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.util.UUID;

@Data
public class MarkPayoutDeductedRequest {
    @NotNull UUID chitId;
    @NotNull UUID memberId;
    @NotNull @Min(1) int monthNumber;
    @NotNull UUID payoutId;
}
