package com.chitfund.userservice.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.time.LocalDate;

@Data
public class RecordUpgradeRequest {

    @NotBlank
    private String tenantId;

    @NotBlank
    private String newPlan;

    @NotBlank
    private String paymentMethod;   // UPI | CASH | BANK_TRANSFER

    private String paymentReference;

    @NotNull
    private LocalDate paymentDate;

    private String notes;

    private String idempotencyKey;

    /** Account credit to deduct from tenant balance (paise). Null = no credit applied. */
    private Long creditAppliedPaise;
}
