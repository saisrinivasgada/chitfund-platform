package com.chitfund.userservice.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.time.LocalDate;

@Data
public class RecordRefundRequest {

    @NotNull
    @Positive
    private Long refundAmountPaise;

    @NotBlank
    @Size(max = 1000)
    private String refundReason;

    @NotBlank
    @Pattern(regexp = "(?i)UPI|CASH|BANK_TRANSFER",
            message = "Refund method must be UPI, CASH, or BANK_TRANSFER")
    private String refundMethod;    // UPI | CASH | BANK_TRANSFER

    @Size(max = 255)
    private String refundReference;

    @NotNull
    private LocalDate refundDate;

    @NotBlank
    @Size(max = 255)
    private String idempotencyKey;
}
