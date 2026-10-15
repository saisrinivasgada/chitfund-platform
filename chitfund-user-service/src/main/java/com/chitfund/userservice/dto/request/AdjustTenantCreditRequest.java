package com.chitfund.userservice.dto.request;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.math.BigDecimal;

@Data
public class AdjustTenantCreditRequest {
    @NotNull
    @DecimalMin("0.01")
    @Digits(integer = 12, fraction = 2)
    private BigDecimal amountInr;

    @NotBlank
    @Size(max = 500)
    private String notes;

    @NotBlank
    @Size(max = 255)
    private String idempotencyKey;
}
