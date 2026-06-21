package com.chitfund.paymentservice.dto.request;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.math.BigDecimal;
import java.util.UUID;

@Data
public class CreateCashRequestRequest {

    @NotNull
    private UUID chitId;

    // Optional: if null, worker collects the full outstanding balance
    @DecimalMin(value = "0.01", message = "Amount must be greater than zero")
    private BigDecimal requestedAmount;

    private String notes;
}
