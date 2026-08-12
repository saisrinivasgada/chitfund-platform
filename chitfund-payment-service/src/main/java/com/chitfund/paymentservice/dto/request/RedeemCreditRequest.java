package com.chitfund.paymentservice.dto.request;

import com.chitfund.paymentservice.domain.enums.AccountType;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.math.BigDecimal;
import java.util.UUID;

@Data
public class RedeemCreditRequest {

    @NotNull(message = "Member ID is required")
    private UUID memberId;

    @NotNull(message = "Amount is required")
    @DecimalMin(value = "0.01", message = "Amount must be positive")
    private BigDecimal amount;

    @NotNull(message = "Account type is required")
    private AccountType accountType;

    private String notes;
}
