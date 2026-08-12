package com.chitfund.paymentservice.dto.request;

import com.chitfund.paymentservice.domain.enums.AccountType;
import com.chitfund.paymentservice.domain.enums.WalletEntryType;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.math.BigDecimal;

@Data
public class AdminWalletEntryRequest {

    @NotNull(message = "Account type is required (CASH or BANK)")
    private AccountType accountType;

    @NotNull(message = "Entry type is required (IN or OUT)")
    private WalletEntryType entryType;

    @NotNull(message = "Amount is required")
    @DecimalMin(value = "0.01", message = "Amount must be positive")
    private BigDecimal amount;

    private String category;
    private String description;
    private String tenantId; // set by controller from TenantContext or internal call body
    private java.util.UUID referenceId;
}
