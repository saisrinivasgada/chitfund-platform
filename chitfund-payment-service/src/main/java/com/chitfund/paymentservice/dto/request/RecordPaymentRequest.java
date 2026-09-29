package com.chitfund.paymentservice.dto.request;

import com.chitfund.paymentservice.domain.enums.PaymentMode;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import lombok.Data;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
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

    /**
     * Optional explicit chit-level allocation. When supplied, the amount must
     * equal the sum of these entries and each entry is applied FIFO only within
     * that selected chit. This prevents an overpayment from silently moving to
     * another chit or becoming credit without the operator choosing that result.
     *
     * Null/empty preserves the legacy FIFO behaviour for older clients.
     */
    @Valid
    private List<RequestedChitAllocation> allocations;

    // Set true to proceed anyway when the server flags this as a possible duplicate
    // of another very recent payment for the same member/chit/amount (e.g. the same
    // cash was already recorded through another device/channel). Defaults to false —
    // the caller must explicitly confirm this isn't a duplicate.
    private boolean confirmDuplicate;
}
