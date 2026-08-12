package com.chitfund.userservice.dto.request;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.math.BigDecimal;

@Data
public class SetTenantDiscountRequest {

    @NotBlank
    private String discountType; // "PERCENTAGE" or "FIXED_PAISE"

    @NotNull
    @DecimalMin("0.01")
    private BigDecimal discountValue;

    private String reason;

    private String expiresAt; // ISO datetime string, nullable
}
