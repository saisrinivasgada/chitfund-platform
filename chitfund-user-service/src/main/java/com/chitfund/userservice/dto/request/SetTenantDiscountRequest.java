package com.chitfund.userservice.dto.request;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import jakarta.validation.constraints.Digits;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Data
public class SetTenantDiscountRequest {

    @NotBlank
    @Pattern(regexp = "(?i)PERCENTAGE|FIXED_PAISE",
            message = "Discount type must be PERCENTAGE or FIXED_PAISE")
    private String discountType; // "PERCENTAGE" or "FIXED_PAISE"

    @NotNull
    @DecimalMin("0.01")
    @Digits(integer = 10, fraction = 2)
    private BigDecimal discountValue;

    @NotBlank
    @Size(max = 500)
    private String reason;

    private LocalDateTime expiresAt;
}
