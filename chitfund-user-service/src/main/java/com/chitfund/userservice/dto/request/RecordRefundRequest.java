package com.chitfund.userservice.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.time.LocalDate;

@Data
public class RecordRefundRequest {

    @NotNull
    private Long refundAmountPaise;

    @NotBlank
    private String refundReason;

    @NotBlank
    private String refundMethod;    // UPI | CASH | BANK_TRANSFER

    private String refundReference;

    @NotNull
    private LocalDate refundDate;
}
