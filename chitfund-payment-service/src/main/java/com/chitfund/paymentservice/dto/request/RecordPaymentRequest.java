package com.chitfund.paymentservice.dto.request;

import com.chitfund.paymentservice.domain.enums.PaymentMode;
import jakarta.validation.constraints.*;
import lombok.Data;

import java.math.BigDecimal;
import java.time.Instant;
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

    // Admin-direct CASH is completed immediately; staff cash collection uses
    // POST /payments/collect and remains pending until remittance.
    @NotNull
    private PaymentMode paymentMode;

    private String notes;

    /** UPI UTR, bank transaction reference, or cheque number. */
    @Size(max = 100, message = "Payment reference must not exceed 100 characters")
    private String paymentReference;

    /** Device-captured business time. Server validates the acceptable offline window. */
    private Instant recordedAt;
}
