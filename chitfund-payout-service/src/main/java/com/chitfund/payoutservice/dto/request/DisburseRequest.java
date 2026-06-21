package com.chitfund.payoutservice.dto.request;

import com.chitfund.payoutservice.domain.enums.DisbursementMode;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.math.BigDecimal;

@Data
public class DisburseRequest {

    @NotNull
    private DisbursementMode disbursementMode;

    // Optional: how much to disburse this time. Null = disburse the full remaining amount.
    // Set a lower value to record a partial disbursement — status becomes PARTIALLY_DISBURSED.
    private BigDecimal amount;

    // Required for UPI, BANK_TRANSFER, CHEQUE. Optional for CASH.
    // UPI → transaction ID, BANK_TRANSFER → UTR, CHEQUE → cheque number
    private String referenceNumber;

    private String notes;
}
