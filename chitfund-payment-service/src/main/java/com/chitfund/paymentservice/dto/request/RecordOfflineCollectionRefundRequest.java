package com.chitfund.paymentservice.dto.request;

import jakarta.validation.constraints.*;
import java.math.BigDecimal;
import java.time.Instant;

/** Records money already returned outside the posted payment ledger; never initiates a transfer. */
public record RecordOfflineCollectionRefundRequest(
        @NotNull @Positive @Digits(integer=12, fraction=2) BigDecimal amount,
        @NotNull @Pattern(regexp="CASH|UPI|BANK_TRANSFER|CHEQUE") String paymentMode,
        @NotBlank @Size(min=3,max=128) String reference,
        @NotNull Instant refundedAt,
        @NotBlank @Size(min=5,max=500) String reason,
        @AssertTrue boolean moneyReturned) { }
