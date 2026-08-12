package com.chitfund.userservice.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.time.LocalDate;

@Data
public class RecordPaymentRequest {

    @NotBlank
    private String tenantId;

    /** PURCHASE or RENEWAL */
    @NotBlank
    private String type;

    @NotBlank
    private String toPlan;

    @NotNull
    private Long amountPaise;

    @NotBlank
    private String paymentMethod;   // UPI | CASH | BANK_TRANSFER

    private String paymentReference;

    @NotNull
    private LocalDate paymentDate;

    private String notes;

    private String idempotencyKey;

    /** Account credit to deduct from tenant balance (paise). Null = no credit applied. */
    private Long creditAppliedPaise;

    /** Gross plan price before credit deduction (paise). 0 = same as amountPaise. */
    private Long grossAmountPaise;
}
