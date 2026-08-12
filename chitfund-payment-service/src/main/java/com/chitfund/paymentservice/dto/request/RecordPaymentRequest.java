package com.chitfund.paymentservice.dto.request;

import com.chitfund.paymentservice.domain.enums.PaymentMode;
import jakarta.validation.constraints.*;
import lombok.Data;

import java.math.BigDecimal;
import java.util.UUID;

@Data
public class RecordPaymentRequest {

    @NotNull
    private UUID chitId;

    @NotNull
    private UUID memberId;

    @NotNull
    @DecimalMin(value = "0.00", message = "Amount cannot be negative")
    private BigDecimal amount;

    // CASH is not allowed here — use POST /payments/collect for cash
    @NotNull
    private PaymentMode paymentMode;

    private String notes;
}
